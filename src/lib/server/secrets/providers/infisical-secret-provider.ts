import { SecretFetchError } from "../errors";
import { createPrivateKeyScanCredential } from "../credential-factory";
import { normalizePrivateKeyPem } from "../pem";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

const FETCH_TIMEOUT_MS = 15_000;

function siteUrl(): string {
  const u = process.env.INFISICAL_SITE_URL?.trim();
  return (u || "https://app.infisical.com").replace(/\/$/, "");
}

function sshSecretName(): string {
  return process.env.BLACKGLASS_SSH_SECRET_NAME?.trim() || "SSH_PRIVATE_KEY";
}

function secretPath(): string {
  const p = process.env.INFISICAL_SECRET_PATH?.trim();
  if (!p || p === "/") return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

type UniversalAuthResponse = {
  data?: { accessToken?: string; access_token?: string };
  accessToken?: string;
};

async function infisicalLogin(base: string, clientId: string, clientSecret: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new SecretFetchError("Infisical universal auth login failed (network)", { cause: e });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SecretFetchError(
      `Infisical universal auth failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as UniversalAuthResponse;
  const token =
    json.data?.accessToken ??
    json.data?.access_token ??
    json.accessToken ??
    "";
  if (!token) {
    throw new SecretFetchError("Infisical universal auth response missing access token");
  }
  return token;
}

function extractSecretValue(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return null;

  const o = payload as Record<string, unknown>;
  const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

  const direct = asString(o.secretValue) ?? asString(o.secret_value) ?? asString(o.value);
  if (direct) return direct;

  const secret = o.secret;
  if (secret && typeof secret === "object") {
    const inner = asString((secret as Record<string, unknown>).secretValue);
    if (inner) return inner;
  }

  const data = o.data;
  if (data && typeof data === "object") {
    const inner = asString((data as Record<string, unknown>).secretValue);
    if (inner) return inner;
  }

  return null;
}

/** Parse Infisical GET /api/v3/secrets/raw response bodies (fixture-tested). */
export function parseInfisicalRawSecretPayload(payload: unknown, secretName: string): string {
  const value = extractSecretValue(payload);
  if (value == null || value.trim() === "") {
    throw new SecretFetchError(
      `Infisical secret "${secretName}" missing or empty (check path, environment, or E2EE / API access)`,
    );
  }
  return value;
}

async function infisicalFetchRawSecret(
  base: string,
  accessToken: string,
  workspaceId: string,
  environmentSlug: string,
  secretName: string,
  path: string,
): Promise<string> {
  const url = new URL(
    `${base}/api/v3/secrets/raw/${encodeURIComponent(secretName)}`,
  );
  url.searchParams.set("workspaceId", workspaceId);
  url.searchParams.set("environment", environmentSlug);
  url.searchParams.set("secretPath", path || "/");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new SecretFetchError("Infisical secret fetch failed (network)", { cause: e });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SecretFetchError(
      `Infisical raw secret failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as unknown;
  return parseInfisicalRawSecretPayload(json, secretName);
}

/**
 * Universal Auth + raw secret download. Requires project settings that allow machine API access
 * to secret values (see Infisical docs on E2EE vs `/raw`).
 */
export class InfisicalSecretProvider implements SecretProvider {
  async fetchScanCredential(ctx: ScanContext): Promise<ScanCredential> {
    const clientId = process.env.INFISICAL_CLIENT_ID?.trim();
    const clientSecret = process.env.INFISICAL_CLIENT_SECRET?.trim();
    const workspaceId = process.env.INFISICAL_PROJECT_ID?.trim();
    const environment = process.env.INFISICAL_ENV_SLUG?.trim();

    if (!clientId || !clientSecret || !workspaceId || !environment) {
      throw new SecretFetchError(
        "Infisical requires INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID, INFISICAL_ENV_SLUG",
      );
    }

    const base = siteUrl();
    const token = await infisicalLogin(base, clientId, clientSecret);
    const name = ctx.credentialRef?.trim() || sshSecretName();
    const path = secretPath();
    const raw = await infisicalFetchRawSecret(base, token, workspaceId, environment, name, path);
    const normalized = normalizePrivateKeyPem(raw);
    const material = Buffer.from(normalized, "utf8");
    return createPrivateKeyScanCredential(material);
  }
}
