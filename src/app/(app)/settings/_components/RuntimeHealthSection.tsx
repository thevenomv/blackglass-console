"use client";

/**
 * Runtime health — operator-facing surface for the admin endpoints
 * `/api/admin/rate-limits` and `/api/admin/queues`.
 *
 * Shown only to owner/admin (the underlying APIs already 403 anyone else,
 * but we hide the section for cleanliness).
 *
 * Refreshes manually (button) and on a 30s timer while the panel is mounted.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type RateBucket = { key: string; activeHits: number };
type RateResponse = {
  backend: "redis" | "memory";
  keys: RateBucket[];
  generatedAt: string;
  note?: string;
};

type QueueStat = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed_recent: number;
  oldest_waiting_ms: number | null;
};
type QueueResponse = {
  redis_configured: boolean;
  generatedAt: string;
  queues?: Record<string, QueueStat | { error: string }>;
};

function isQueueStat(v: QueueStat | { error: string }): v is QueueStat {
  return typeof (v as QueueStat).waiting === "number";
}

function ago(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  if (ms < 5_000) return "just now";
  return `${ago(ms)} ago`;
}

const MAX_BUCKETS_VISIBLE = 12;
/** Buckets ≥ this count are visually marked as "warm" — they're not
 *  necessarily over-limit (we don't know the per-route ceiling here),
 *  but they're worth glancing at when triaging 429 reports. */
const WARM_THRESHOLD = 50;

export function RuntimeHealthSection() {
  const [rate, setRate] = useState<RateResponse | null>(null);
  const [queues, setQueues] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/rate-limits", { cache: "no-store" }),
        fetch("/api/admin/queues", { cache: "no-store" }),
      ]);
      if (r1.status === 403 || r2.status === 403) {
        setError("Owner / admin role required.");
        return;
      }
      setRate(r1.ok ? ((await r1.json()) as RateResponse) : null);
      setQueues(r2.ok ? ((await r2.json()) as QueueResponse) : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Manual refresh: flips loading on synchronously, then dispatches.
  const refresh = useCallback(() => {
    setLoading(true);
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    // Initial mount fetch + 30s polling — same pattern as DriftTrendChart /
    // EvidenceView elsewhere in the app; setState happens after await inside
    // fetchOnce so the cascade rule's intent (sync state thrash on mount) is
    // not violated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), 30_000);
    return () => clearInterval(id);
  }, [fetchOnce]);

  if (error) {
    return (
      <p className="text-xs text-fg-faint">{error}</p>
    );
  }

  // Sort buckets by activity descending so the most-active key is at the
  // top — that's almost always the one an operator wants to see when
  // triaging 429s.
  const sortedKeys = rate
    ? [...rate.keys].sort((a, b) => b.activeHits - a.activeHits)
    : [];
  const visibleKeys = sortedKeys.slice(0, MAX_BUCKETS_VISIBLE);
  const hiddenCount = Math.max(0, sortedKeys.length - visibleKeys.length);
  const lastRefreshed = rate?.generatedAt ?? queues?.generatedAt ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-faint">
          Refreshes every 30 seconds. Backed by the same{" "}
          <code className="font-mono">/api/admin/*</code> endpoints used by ops alerts.
          {lastRefreshed ? (
            <>
              {" · "}
              <span title={lastRefreshed}>Updated {timeSince(lastRefreshed)}</span>
            </>
          ) : null}
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={refresh}
        >
          {loading ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Rate-limit buckets
          </p>
          {rate ? (
            <>
              <p className="mt-1 text-xs text-fg-muted">
                Backend: <span className="font-mono">{rate.backend}</span>
                {rate.note ? ` — ${rate.note}` : ""}
              </p>
              {visibleKeys.length === 0 ? (
                <p className="mt-2 text-xs text-fg-faint">No active buckets.</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-1 text-xs">
                    {visibleKeys.map((k) => {
                      const warm = k.activeHits >= WARM_THRESHOLD;
                      return (
                        <li
                          key={k.key}
                          className="flex justify-between gap-3 font-mono"
                        >
                          <span className="truncate text-fg-muted">{k.key}</span>
                          <span
                            className={
                              warm
                                ? "text-warning font-semibold"
                                : "text-fg-primary"
                            }
                            title={
                              warm
                                ? `≥${WARM_THRESHOLD} active hits — bucket is warm`
                                : undefined
                            }
                          >
                            {k.activeHits}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {hiddenCount > 0 ? (
                    <p className="mt-2 text-[11px] text-fg-faint">
                      …and {hiddenCount} more bucket
                      {hiddenCount === 1 ? "" : "s"} (sorted by activity).
                    </p>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-fg-faint">No data.</p>
          )}
        </div>

        <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Background job queues
          </p>
          {queues?.redis_configured === false ? (
            <p className="mt-2 text-xs text-fg-faint">
              REDIS_QUEUE_URL is not set — running in in-process mode (no
              cross-process queues).
            </p>
          ) : queues?.queues ? (
            <ul className="mt-2 space-y-2 text-xs">
              {Object.entries(queues.queues).map(([name, stats]) => (
                <li key={name}>
                  <p className="font-mono text-[11px] text-fg-primary">{name}</p>
                  {isQueueStat(stats) ? (
                    <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                      waiting:{stats.waiting} active:{stats.active} delayed:
                      {stats.delayed} failed:{stats.failed}
                      {stats.oldest_waiting_ms != null
                        ? ` · oldest ${ago(stats.oldest_waiting_ms)}`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
                      error: {stats.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-fg-faint">No data.</p>
          )}
        </div>
      </div>
    </div>
  );
}
