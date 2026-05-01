import { SecretFetchError } from "./errors";
import { normalizePrivateKeyPem } from "./pem";
import type { ScanCredential } from "./types";

/** Material passed to ssh2 `connect()` for this scan. */
export type SshAuthConfig =
  | { mode: "pem"; privateKey: string }
  | { mode: "cert"; privateKey: string | Buffer; publicKey: string };

export function scanCredentialToSshAuth(c: ScanCredential): SshAuthConfig {
  if (c.kind === "private_key") {
    return { mode: "pem", privateKey: normalizePrivateKeyPem(c.material.toString("utf8")) };
  }
  if (c.kind === "ssh_certificate") {
    return {
      mode: "cert",
      privateKey: c.privateKey,
      publicKey: c.certificate.trim(),
    };
  }
  const _exhaustive: never = c;
  return _exhaustive;
}

/** @deprecated use scanCredentialToSshAuth */
export function scanCredentialToPrivateKeyPem(c: ScanCredential): string {
  const a = scanCredentialToSshAuth(c);
  if (a.mode !== "pem") {
    throw new SecretFetchError(
      "Expected private_key credential; got ssh_certificate (use SECRET_PROVIDER that yields PEM or use collector path that accepts certs).",
    );
  }
  return a.privateKey;
}
