/**
 * Optional global daily cap on evidence bundle downloads (GET .../file).
 * In-memory counter (resets on process restart). Set EVIDENCE_BUNDLE_DAILY_LIMIT=0 to disable.
 */
const counts = new Map<string, number>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function takeEvidenceBundleDownload(): { ok: true } | { ok: false; code: string } {
  const lim = parseInt(process.env.EVIDENCE_BUNDLE_DAILY_LIMIT ?? "0", 10);
  if (!Number.isFinite(lim) || lim <= 0) return { ok: true };
  const k = utcDay();
  const cur = counts.get(k) ?? 0;
  if (cur >= lim) return { ok: false, code: "evidence_daily_quota_exceeded" };
  counts.set(k, cur + 1);
  return { ok: true };
}
