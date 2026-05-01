/**
 * Normalize PEM / OpenSSH key text from env or APIs.
 * App Platform and CI often store newlines as literal `\n` or use CRLF.
 */
export function normalizePrivateKeyPem(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}
