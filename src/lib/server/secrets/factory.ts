import { SecretFetchError } from "./errors";
import type { SecretProvider } from "./types";
import { EnvSecretProvider } from "./providers/env-secret-provider";
import { DopplerSecretProvider } from "./providers/doppler-secret-provider";
import { InfisicalSecretProvider } from "./providers/infisical-secret-provider";
import { VaultSecretProvider } from "./providers/vault-secret-provider";

/** Active `SECRET_PROVIDER` label (`env` when unset). */
export function activeSecretProviderMode(): string {
  return (process.env.SECRET_PROVIDER ?? "env").trim().toLowerCase() || "env";
}

export function createSecretProviderFromEnv(): SecretProvider {
  const mode = activeSecretProviderMode();
  switch (mode) {
    case "env":
      return new EnvSecretProvider();
    case "doppler":
      return new DopplerSecretProvider();
    case "infisical":
      return new InfisicalSecretProvider();
    case "vault":
      return new VaultSecretProvider();
    default:
      throw new SecretFetchError(
        `Unknown SECRET_PROVIDER "${process.env.SECRET_PROVIDER}". Use env, doppler, infisical, or vault.`,
      );
  }
}

/** True when SECRET_PROVIDER and related vars are sufficient for the active mode. */
export function credentialSourceConfigured(): boolean {
  try {
    const mode = activeSecretProviderMode();
    switch (mode) {
      case "env":
        return Boolean(process.env.SSH_PRIVATE_KEY?.trim());
      case "doppler":
        return Boolean(
          process.env.DOPPLER_PROJECT?.trim() && process.env.DOPPLER_CONFIG?.trim(),
        );
      case "infisical":
        return Boolean(
          process.env.INFISICAL_CLIENT_ID?.trim() &&
            process.env.INFISICAL_CLIENT_SECRET?.trim() &&
            process.env.INFISICAL_PROJECT_ID?.trim() &&
            process.env.INFISICAL_ENV_SLUG?.trim(),
        );
      case "vault":
        return Boolean(
          process.env.VAULT_ADDR?.trim() &&
            process.env.VAULT_SSH_SIGN_ROLE?.trim() &&
            (process.env.VAULT_TOKEN?.trim() ||
              (process.env.VAULT_ROLE_ID?.trim() && process.env.VAULT_SECRET_ID?.trim())),
        );
      default:
        return false;
    }
  } catch {
    return false;
  }
}
