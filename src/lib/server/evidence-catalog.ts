/**
 * Server-side catalog of evidence bundle metadata (matches `/api/v1/evidence/bundles/:id`).
 * Populate when export pipeline persists bundles.
 */

export const EVIDENCE_BUNDLE_META: Record<
  string,
  { sha256: string; expiresInSeconds: number; bytes: number }
> = {
  "bundle-production-weekly": {
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    expiresInSeconds: 86400,
    bytes: 12_288,
  },
  "host-07-incident": {
    sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    expiresInSeconds: 86400,
    bytes: 8192,
  },
};

export function evidenceBundleCatalogSize(): number {
  return Object.keys(EVIDENCE_BUNDLE_META).length;
}
