import { SecretFetchError } from "../errors";
import { createPrivateKeyScanCredential } from "../credential-factory";
import { normalizePrivateKeyPem } from "../pem";
import { maybeDecryptPem } from "../envelope";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

/**
 * Reads `SSH_PRIVATE_KEY` from the process environment at fetch time.
 * The value may be a plain PEM string or an envelope-encrypted JSON blob
 * (see `src/lib/server/secrets/envelope.ts`).  Set KMS_PROVIDER to enable
 * transparent decryption.
 * Prefer Doppler/Infisical in production so the PEM is not stored in App Platform.
 */
export class EnvSecretProvider implements SecretProvider {
  async fetchScanCredential(_ctx: ScanContext): Promise<ScanCredential> {
    const raw = process.env.SSH_PRIVATE_KEY;
    if (!raw?.trim()) {
      throw new SecretFetchError("SSH_PRIVATE_KEY env var not set");
    }
    const material = await maybeDecryptPem(raw);
    const normalized = normalizePrivateKeyPem(material.toString("utf8"));
    return createPrivateKeyScanCredential(Buffer.from(normalized, "utf8"));
  }
}
