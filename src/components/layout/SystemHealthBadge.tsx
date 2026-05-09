"use client";

import { useEffect, useState } from "react";

/**
 * Tiny system-health pill rendered in the sidebar footer. Polls the
 * same /api/status endpoint that powers the public marketing status
 * page, so operators see the deployment's true posture without
 * leaving the console.
 *
 * Failure handling: if the fetch errors (network, 5xx, etc.) we
 * label as "unknown" rather than "down" — a transient blip while
 * the user is loading the dashboard shouldn't paint the badge red.
 *
 * Polling cadence: 60s. /api/status is edge-cached for 30s so this
 * cadence guarantees a fresh sample every other tick at most.
 */

type Status = "operational" | "degraded" | "down" | "unknown" | "loading";

interface StatusResponse {
  status: "operational" | "degraded" | "down";
  components?: Record<string, { status: string; latencyMs?: number } | undefined>;
}

const POLL_MS = 60_000;

const STYLES: Record<Status, { dot: string; label: string; text: string }> = {
  operational: { dot: "bg-success", label: "All systems operational", text: "text-fg-muted" },
  degraded: { dot: "bg-warning", label: "Degraded performance", text: "text-fg-muted" },
  down: { dot: "bg-danger", label: "Major outage", text: "text-fg-muted" },
  unknown: { dot: "bg-fg-faint", label: "Status unknown", text: "text-fg-faint" },
  loading: { dot: "bg-fg-faint animate-pulse", label: "Checking systems…", text: "text-fg-faint" },
};

export function SystemHealthBadge() {
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setStatus("unknown");
          return;
        }
        const body = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(body.status);
        if (body.status !== "operational" && body.components) {
          // Surface the first non-OK, non-"not_configured" component
          // so the user can hover the badge and see WHICH dependency
          // is unhappy without round-tripping to /status.
          const offending = Object.entries(body.components).find(
            ([, c]) => c?.status === "down",
          );
          setDetail(offending ? offending[0] : null);
        } else {
          setDetail(null);
        }
      } catch {
        if (!cancelled) setStatus("unknown");
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const style = STYLES[status];
  const tooltip = detail
    ? `${style.label} · ${detail} reporting issues — open status page for details`
    : `${style.label} — open public status page`;

  return (
    <a
      href="/status"
      target="_blank"
      rel="noreferrer"
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-bg-elevated ${style.text}`}
    >
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <span className="truncate">{style.label}</span>
    </a>
  );
}
