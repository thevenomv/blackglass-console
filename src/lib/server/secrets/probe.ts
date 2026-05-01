import { dopplerMeViaCli } from "./doppler-cli-download";
import { activeSecretProviderMode } from "./factory";
import { SecretFetchError } from "./errors";

const PROBE_MS = 10_000;

export type SecretsProbeResult = {
  provider: string;
  ok: boolean;
  duration_ms: number;
  detail?: string;
};

/**
 * Lightweight reachability check (no full PEM download for Doppler/Infisical where avoidable).
 */
export async function probeSecretBackendReachable(): Promise<SecretsProbeResult> {
  const provider = activeSecretProviderMode();
  const t0 = Date.now();

  try {
    switch (provider) {
      case "env": {
        return {
          provider,
          ok: true,
          duration_ms: Date.now() - t0,
          detail: "env provider uses process env only",
        };
      }
      case "doppler": {
        const token = process.env.DOPPLER_TOKEN?.trim();
        if (token) {
          const res = await fetch("https://api.doppler.com/v3/me", {
            method: "GET",
            headers: { accept: "application/json", authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(PROBE_MS),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new SecretFetchError(`Doppler me: HTTP ${res.status} — ${text.slice(0, 120)}`);
          }
        } else {
          await dopplerMeViaCli();
        }
        return { provider, ok: true, duration_ms: Date.now() - t0 };
      }
      case "infisical": {
        const clientId = process.env.INFISICAL_CLIENT_ID?.trim();
        const clientSecret = process.env.INFISICAL_CLIENT_SECRET?.trim();
        const base = (process.env.INFISICAL_SITE_URL?.trim() || "https://app.infisical.com").replace(
          /\/$/,
          "",
        );
        if (!clientId || !clientSecret) {
          throw new SecretFetchError("INFISICAL_CLIENT_ID/SECRET not set");
        }
        const res = await fetch(`${base}/api/v1/auth/universal-auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ clientId, clientSecret }),
          signal: AbortSignal.timeout(PROBE_MS),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new SecretFetchError(`Infisical login: HTTP ${res.status} — ${text.slice(0, 120)}`);
        }
        return { provider, ok: true, duration_ms: Date.now() - t0 };
      }
      case "vault": {
        const addr = process.env.VAULT_ADDR?.trim()?.replace(/\/$/, "");
        if (!addr) throw new SecretFetchError("VAULT_ADDR not set");
        const res = await fetch(`${addr}/v1/sys/health?standbyok=true`, {
          method: "GET",
          signal: AbortSignal.timeout(PROBE_MS),
        });
        if (!res.ok) {
          throw new SecretFetchError(`Vault sys/health: HTTP ${res.status}`);
        }
        return { provider, ok: true, duration_ms: Date.now() - t0, detail: "sys/health" };
      }
      default:
        return {
          provider,
          ok: false,
          duration_ms: Date.now() - t0,
          detail: "unknown provider",
        };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      provider,
      ok: false,
      duration_ms: Date.now() - t0,
      detail: msg.slice(0, 240),
    };
  }
}
