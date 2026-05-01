/**
 * Server-side catalog of demo / stub evidence bundles (matches `/api/v1/evidence/bundles/:id`).
 */

export const EVIDENCE_BUNDLE_META: Record<
  string,
  { sha256: string; expiresInSeconds: number; bytes: number }
> = {
  "bundle-production-weekly": {
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    expiresInSeconds: 3600,
    bytes: 182903,
  },
  "bundle-host-07-incident": {
    sha256: "a9f12bde045c8912f8f3ecc17a3e9b7d6c5e4f30291827364556473829100abc",
    expiresInSeconds: 900,
    bytes: 48211,
  },
};

export function evidenceBundleCatalogSize(): number {
  return Object.keys(EVIDENCE_BUNDLE_META).length;
}
