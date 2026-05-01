import { createSecretProviderFromEnv, activeSecretProviderMode } from "./factory";
import { scanCredentialToSshAuth } from "./credential-to-ssh-auth";
import type { ScanContext } from "./types";
import type { SshAuthConfig } from "./credential-to-ssh-auth";
import { logCollectorEvent } from "../collector-events";

export async function runWithCollectorCredential<T>(
  ctx: ScanContext,
  run: (auth: SshAuthConfig) => Promise<T>,
): Promise<T> {
  const provider = createSecretProviderFromEnv();
  const providerMode = activeSecretProviderMode();
  const t0 = Date.now();
  logCollectorEvent("collector.secret_fetch.start", {
    scan_id: ctx.scanId,
    reason: ctx.reason,
    host_count: ctx.hostCount,
    secret_provider: providerMode,
  });

  let credential;
  try {
    credential = await provider.fetchScanCredential(ctx);
  } catch (e) {
    logCollectorEvent("collector.secret_fetch.error", {
      scan_id: ctx.scanId,
      duration_ms: Date.now() - t0,
      secret_provider: providerMode,
      error: e instanceof Error ? e.name : "Error",
      message:
        e instanceof Error
          ? e.message.slice(0, 240)
          : String(e).slice(0, 240),
    });
    throw e;
  }

  logCollectorEvent("collector.secret_fetch.ok", {
    scan_id: ctx.scanId,
    duration_ms: Date.now() - t0,
    secret_provider: providerMode,
    credential_kind: credential.kind,
  });

  try {
    const auth = scanCredentialToSshAuth(credential);
    return await run(auth);
  } finally {
    const revokeAfter =
      process.env.BLACKGLASS_VAULT_REVOKE_AFTER_SCAN?.trim().toLowerCase();
    const doRevoke =
      revokeAfter === "1" || revokeAfter === "true" || revokeAfter === "yes";
    const serial =
      credential.kind === "ssh_certificate"
        ? credential.serial?.trim()
        : undefined;
    if (doRevoke && serial && typeof provider.revokeCredential === "function") {
      try {
        await provider.revokeCredential({ serial });
        logCollectorEvent("collector.vault_revoke.ok", {
          scan_id: ctx.scanId,
          secret_provider: providerMode,
        });
      } catch (e) {
        logCollectorEvent("collector.vault_revoke.error", {
          scan_id: ctx.scanId,
          secret_provider: providerMode,
          error: e instanceof Error ? e.name : "Error",
          message:
            e instanceof Error
              ? e.message.slice(0, 240)
              : String(e).slice(0, 240),
        });
      }
    }
    credential.release();
  }
}

export {
  createSecretProviderFromEnv,
  credentialSourceConfigured,
  activeSecretProviderMode,
} from "./factory";
export { SecretFetchError } from "./errors";
export { normalizePrivateKeyPem } from "./pem";
export { scanCredentialToSshAuth, scanCredentialToPrivateKeyPem } from "./credential-to-ssh-auth";
export type { SshAuthConfig } from "./credential-to-ssh-auth";
export { probeSecretBackendReachable } from "./probe";
export type { SecretsProbeResult } from "./probe";
export type { ScanContext, ScanCredential, ScanReason, SecretProvider } from "./types";
