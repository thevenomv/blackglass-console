"use client";

/**
 * Webhook delivery log — last 50 attempts from the BullMQ outbound queue.
 * Operators can filter by status and retry failed deliveries one-click.
 *
 * Backed by /api/admin/webhook-deliveries (introspects QUEUE_NAMES.WEBHOOKS).
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type DeliveryRow = {
  id: string;
  status: "completed" | "failed" | "active" | "waiting" | "delayed";
  url: string;
  scanId: string | null;
  tenantId: string | null;
  attemptsMade: number;
  enqueuedAt: string;
  finishedAt: string | null;
  failedReason?: string;
};

type Filter = "all" | "failed" | "completed" | "active";

function statusTone(s: DeliveryRow["status"]): "neutral" | "success" | "warning" | "accent" {
  if (s === "completed") return "success";
  if (s === "failed") return "warning";
  if (s === "active" || s === "waiting" || s === "delayed") return "accent";
  return "neutral";
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const path = url.pathname.length > 1 ? url.pathname : "";
    return `${url.host}${path}`;
  } catch {
    return u;
  }
}

export function WebhookDeliveryLog() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [redisConfigured, setRedisConfigured] = useState<boolean>(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async (which: Filter) => {
    try {
      const res = await fetch(`/api/admin/webhook-deliveries?status=${which}`, { cache: "no-store" });
      if (res.status === 403) {
        setError("Owner / admin role required.");
        return;
      }
      const json = (await res.json()) as {
        redis_configured: boolean;
        deliveries: DeliveryRow[];
        note?: string;
      };
      setRedisConfigured(json.redis_configured);
      setRows(json.deliveries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(
    (which: Filter) => {
      setLoading(true);
      void fetchOnce(which);
    },
    [fetchOnce],
  );

  useEffect(() => {
    // setState happens after await inside fetchOnce — same pattern used by
    // EvidenceView; the rule fires on the call site regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce(filter);
  }, [filter, fetchOnce]);

  async function retryJob(id: string) {
    setRetrying(id);
    try {
      const res = await fetch(`/api/admin/webhook-deliveries/${encodeURIComponent(id)}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `Server returned ${res.status}`);
      }
      await fetchOnce(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  if (!redisConfigured) {
    return (
      <p className="text-xs text-fg-faint">
        Outbound webhooks deliver inline (no Redis queue). Configure{" "}
        <code className="font-mono">REDIS_QUEUE_URL</code> to enable retry + DLQ.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 text-[11px]">
          {(["all", "failed", "completed", "active"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 font-medium uppercase tracking-wide ${
                filter === f
                  ? "bg-accent-blue text-white"
                  : "bg-bg-elevated text-fg-muted hover:text-fg-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => refresh(filter)}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="text-xs text-fg-faint">No deliveries match.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded border border-border-subtle bg-bg-panel-elevated">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              <span className="font-mono text-fg-primary">{shortUrl(r.url)}</span>
              <span className="text-fg-faint">attempts {r.attemptsMade}</span>
              {r.scanId ? (
                <span className="font-mono text-[10px] text-fg-faint">scan: {r.scanId.slice(0, 8)}</span>
              ) : null}
              <span className="ml-auto text-fg-faint">{new Date(r.enqueuedAt).toLocaleString("en-GB")}</span>
              {r.status === "failed" ? (
                <Button
                  variant="secondary"
                  disabled={retrying === r.id}
                  onClick={() => void retryJob(r.id)}
                >
                  {retrying === r.id ? "Retrying…" : "Retry"}
                </Button>
              ) : null}
              {r.failedReason ? (
                <p className="basis-full text-[11px] text-danger">{r.failedReason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
