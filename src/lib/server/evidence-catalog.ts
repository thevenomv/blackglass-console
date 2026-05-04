/**
 * Server-side catalog of evidence bundle metadata (matches `/api/v1/evidence/bundles/:id`).
 * Populate when export pipeline persists bundles.
 */

export const EVIDENCE_BUNDLE_META: Record<
  string,
  { sha256: string; expiresInSeconds: number; bytes: number }
> = {};

export function evidenceBundleCatalogSize(): number {
  return Object.keys(EVIDENCE_BUNDLE_META).length;
}
