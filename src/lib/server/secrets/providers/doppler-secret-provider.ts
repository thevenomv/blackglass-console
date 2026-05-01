import { loadDopplerSecretsJsonViaCli } from "../doppler-cli-download";
import { SecretFetchError } from "../errors";
import { createPrivateKeyScanCredential } from "../credential-factory";
import { normalizePrivateKeyPem } from "../pem";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

const DOPPLER_DOWNLOAD = "https://api.doppler.com/v3/configs/config/secrets/download";

const FETCH_TIMEOUT_MS = 15_000;

function sshSecretName(): string {
  return process.env.BLACKGLASS_SSH_SECRET_NAME?.trim() || "SSH_PRIVATE_KEY";
}

/** Parse Doppler JSON download body and return one secret string (fixture-tested). */
export function parseDopplerSecretsDownload(body: unknown, secretName: string): string {
  if (!body || typeof body !== "object") {
    throw new SecretFetchError("Doppler returned non-object JSON for secrets download");
  }
  const secrets = body as Record<string, unknown>;
  const raw = secrets[secretName];
  if (raw == null || String(raw).trim() === "") {
    throw new SecretFetchError(
      `Doppler secret "${secretName}" missing or empty (set BLACKGLASS_SSH_SECRET_NAME to override)`,
    );
  }
  return String(raw);
}

async function dopplerFetchJson(
  token: string,
  project: string,
  config: string,
): Promise<unknown> {
  const url = new URL(DOPPLER_DOWNLOAD);
  url.searchParams.set("format", "json");
  url.searchParams.set("project", project);
  url.searchParams.set("config", config);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new SecretFetchError("Doppler secrets download failed (network)", { cause: e });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SecretFetchError(
      `Doppler secrets download failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }

  return res.json();
}

/**
 * Runtime fetch of the SSH PEM from Doppler (JSON download).
 * @see https://docs.doppler.com/docs/download-secrets
 */
export class DopplerSecretProvider implements SecretProvider {
  async fetchScanCredential(ctx: ScanContext): Promise<ScanCredential> {
    const token = process.env.DOPPLER_TOKEN?.trim();
    const project = process.env.DOPPLER_PROJECT?.trim();
    const config = process.env.DOPPLER_CONFIG?.trim();

    if (!project || !config) {
      throw new SecretFetchError(
        "Doppler requires DOPPLER_PROJECT and DOPPLER_CONFIG (set in env or inject via `doppler run`)",
      );
    }

    const name = ctx.credentialRef?.trim() || sshSecretName();
    const body = token
      ? await dopplerFetchJson(token, project, config)
      : await loadDopplerSecretsJsonViaCli();
    const raw = parseDopplerSecretsDownload(body, name);

    const normalized = normalizePrivateKeyPem(raw);
    const material = Buffer.from(normalized, "utf8");
    return createPrivateKeyScanCredential(material);
  }
}
