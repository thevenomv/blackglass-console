/**
 * Compact, opinionated time formatters for UI surfaces.
 *
 * Goals:
 *  - "less is more": short relative strings ("5m ago", "2d ago") instead of
 *    long absolute timestamps in dense table cells.
 *  - Always render *something* — never throw, never render "Invalid Date".
 *  - Pair with `formatAbsoluteUtc()` as a tooltip so the absolute time stays
 *    one hover away.
 *
 * No external date library — we ship a few-line implementation rather than
 * pulling in date-fns/luxon for two pure functions.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Render an ISO timestamp as a short relative string suitable for table
 * cells: "just now", "5m ago", "3h ago", "2d ago", or for older values an
 * absolute fallback ("12 Mar 2026"). Returns the configured `empty` string
 * (default `"—"`) for null/undefined/invalid input.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  opts: { empty?: string; now?: number } = {},
): string {
  const empty = opts.empty ?? "—";
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return empty;
  const now = opts.now ?? Date.now();
  const diff = now - t;
  if (diff < 0) {
    // Future timestamp (clock skew). Treat as "just now" rather than confusing
    // operators with negative-relative copy.
    return "just now";
  }
  if (diff < 45_000) return "just now";
  if (diff < HOUR_MS) {
    const m = Math.max(1, Math.round(diff / MINUTE_MS));
    return `${m}m ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.max(1, Math.round(diff / HOUR_MS));
    return `${h}h ago`;
  }
  if (diff < 30 * DAY_MS) {
    const d = Math.max(1, Math.round(diff / DAY_MS));
    return `${d}d ago`;
  }
  // Anything older than ~30 days — relative time stops being useful, fall
  // back to a compact absolute date.
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(t));
  } catch {
    return iso;
  }
}

/**
 * Render an ISO timestamp as a full UTC string suitable for a tooltip
 * (`title=`) on a relative-time cell. Returns the configured `empty` string
 * (default `"—"`) for null/undefined/invalid input.
 */
export function formatAbsoluteUtc(
  iso: string | null | undefined,
  opts: { empty?: string } = {},
): string {
  const empty = opts.empty ?? "—";
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return empty;
  try {
    return `${new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(t))} UTC`;
  } catch {
    return iso;
  }
}
