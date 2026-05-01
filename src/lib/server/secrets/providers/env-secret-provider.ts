import { SecretFetchError } from "../errors";
import { createPrivateKeyScanCredential } from "../credential-factory";
import { normalizePrivateKeyPem } from "../pem";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

/**
 * Reads `SSH_PRIVATE_KEY` from the process environment at fetch time.
 * Prefer Doppler/Infisical in production so the PEM is not stored in App Platform.
 */
export class EnvSecretProvider implements SecretProvider {
  async fetchScanCredential(_ctx: ScanContext): Promise<ScanCredential> {
    const raw = process.env.SSH_PRIVATE_KEY;
    if (!raw?.trim()) {
      throw new SecretFetchError("SSH_PRIVATE_KEY env var not set");
    }
    const normalized = normalizePrivateKeyPem(raw);
    const material = Buffer.from(normalized, "utf8");
    return createPrivateKeyScanCredential(material);
  }
}
