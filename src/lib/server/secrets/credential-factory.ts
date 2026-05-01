import type { ScanCredential } from "./types";

export function createPrivateKeyScanCredential(
  material: Buffer,
  passphrase?: Buffer,
): ScanCredential {
  return {
    kind: "private_key",
    material,
    passphrase,
    release: () => {
      try {
        material.fill(0);
        passphrase?.fill(0);
      } catch {
        /* ignore */
      }
    },
  };
}

export function createSshCertificateScanCredential(
  privateKeyOpenssh: string,
  certificate: string,
  serial?: string,
): ScanCredential {
  const privateKey = Buffer.from(privateKeyOpenssh, "utf8");
  return {
    kind: "ssh_certificate",
    privateKey,
    certificate: certificate.trim(),
    serial,
    release: () => {
      try {
        privateKey.fill(0);
      } catch {
        /* ignore */
      }
    },
  };
}
