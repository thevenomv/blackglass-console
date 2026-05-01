import { utils as ssh2utils } from "ssh2";
import { SecretFetchError } from "../errors";
import { createSshCertificateScanCredential } from "../credential-factory";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

const FETCH_TIMEOUT_MS = 20_000;

function vaultAddr(): string {
  const u = process.env.VAULT_ADDR?.trim();
  if (!u) throw new SecretFetchError("VAULT_ADDR is not set");
  return u.replace(/\/$/, "");
}

function sshMount(): string {
  return process.env.VAULT_SSH_MOUNT?.trim() || "ssh";
}

function signRole(): string {
  const r = process.env.VAULT_SSH_SIGN_ROLE?.trim();
  if (!r) throw new SecretFetchError("VAULT_SSH_SIGN_ROLE is not set");
  return r;
}

function validPrincipals(): string {
  const p = process.env.VAULT_SSH_VALID_PRINCIPALS?.trim();
  if (p) return p;
  return process.env.COLLECTOR_USER?.trim() || "blackglass";
}

type VaultWrap = { data?: { signed_key?: string; serial_number?: string } };

async function vaultFetch(
  token: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const base = vaultAddr();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {};
  if (token) headers["X-Vault-Token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new SecretFetchError(`Vault request failed: ${path}`, { cause: e });
  }

  const text = await res.text().catch(() => "");
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new SecretFetchError(
      `Vault returned non-JSON for ${path}: HTTP ${res.status} — ${text.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    const errs = (json as { errors?: string[] })?.errors?.join("; ");
    throw new SecretFetchError(
      `Vault ${path} failed: HTTP ${res.status}${errs ? ` — ${errs}` : ` — ${text.slice(0, 200)}`}`,
    );
  }

  return json;
}

async function vaultClientToken(): Promise<string> {
  const direct = process.env.VAULT_TOKEN?.trim();
  if (direct) return direct;

  const roleId = process.env.VAULT_ROLE_ID?.trim();
  const secretId = process.env.VAULT_SECRET_ID?.trim();
  if (!roleId || !secretId) {
    throw new SecretFetchError(
      "Vault auth requires VAULT_TOKEN or VAULT_ROLE_ID + VAULT_SECRET_ID",
    );
  }

  const json = (await vaultFetch(undefined, "POST", "/v1/auth/approle/login", {
    role_id: roleId,
    secret_id: secretId,
  })) as { auth?: { client_token?: string } };

  const tok = json.auth?.client_token?.trim();
  if (!tok) {
    throw new SecretFetchError("Vault AppRole login returned no client_token");
  }
  return tok;
}

/**
 * HashiCorp Vault SSH secrets engine: JIT user cert via sign endpoint.
 * Env: `VAULT_ADDR`, `VAULT_SSH_SIGN_ROLE`, `VAULT_TOKEN` or AppRole, optional `VAULT_SSH_MOUNT` (default `ssh`),
 * `VAULT_SSH_VALID_PRINCIPALS` (default `COLLECTOR_USER` or `blackglass`).
 */
export class VaultSecretProvider implements SecretProvider {
  async fetchScanCredential(_ctx: ScanContext): Promise<ScanCredential> {
    const token = await vaultClientToken();
    const keys = ssh2utils.generateKeyPairSync("ed25519") as {
      public: string;
      private: string;
    };

    const mount = encodeURIComponent(sshMount());
    const role = encodeURIComponent(signRole());
    const path = `/v1/${mount}/sign/${role}`;

    const json = (await vaultFetch(token, "POST", path, {
      public_key: keys.public.trim(),
      valid_principals: validPrincipals(),
      cert_type: "user",
    })) as VaultWrap;

    const signed = json.data?.signed_key?.trim();
    if (!signed) {
      throw new SecretFetchError("Vault SSH sign response missing data.signed_key");
    }

    const serial = json.data?.serial_number?.trim();

    return createSshCertificateScanCredential(keys.private, signed, serial || undefined);
  }

  async revokeCredential(handle: { serial?: string }): Promise<void> {
    const serial = handle.serial?.trim();
    if (!serial) return;
    const token = await vaultClientToken();
    const mount = encodeURIComponent(sshMount());
    await vaultFetch(token, "POST", `/v1/${mount}/revoke`, {
      serial_number: serial,
    });
  }
}
