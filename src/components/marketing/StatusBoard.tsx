"use client";

/**
 * StatusBoard — client component for /status.
 *
 * Polls /api/status every 30 seconds, renders the headline status
 * (operational / degraded / down) plus a per-component grid with
 * latency and "not configured" affordances.
 *
 * Why client-side polling: the status page should reflect the LIVE
 * state, not a Next.js cached snapshot. Pinning this to a server
 * component would force RSC re-renders for every visitor and tie
 * freshness to deploy-time caching rules. Hydrating once + polling
 * is cheaper and more honest.
 */

import { useEffect, useState } from "react";

type Component = {
  status: "ok" | "down" | "not_configured";
  latencyMs?: number;
};

type Snapshot = {
  status: "operational" | "degraded" | "down";
  checkedAt: string;
  durationMs: number;
  components: Record<string, Component>;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: Snapshot; refreshedAt: number }
  | { kind: "error"; message: string; refreshedAt: number };

const COMPONENT_LABELS: Record<string, string> = {
  console: "Console",
  api: "Public API",
  database: "Database (Postgres)",
  redis: "Queue + cache (Redis)",
  spaces: "Object store (Spaces)",
};

const COMPONENT_DESCRIPTIONS: Record<string, string> = {
  console: "The web app you're using right now.",
  api: "REST endpoints under /api/v1 — used by agents and integrations.",
  database: "Drift events, baselines, audit log, tenant data.",
  redis: "Background job queue + rate-limit + scan progress.",
  spaces: "Long-term evidence bundles + plan-state snapshots.",
};

const POLL_INTERVAL_MS = 30_000;

export function StatusBoard() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: `Status endpoint returned HTTP ${res.status}.`,
              refreshedAt: Date.now(),
            });
          }
          return;
        }
        const snapshot = (await res.json()) as Snapshot;
        if (!cancelled) {
          setState({ kind: "ok", snapshot, refreshedAt: Date.now() });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Could not reach /api/status.",
            refreshedAt: Date.now(),
          });
        }
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="rounded-card border border-border-default bg-bg-panel p-6 text-sm text-fg-muted">
        Checking system health…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-card border border-danger/40 bg-danger-soft/30 p-6 text-sm text-danger">
        Could not reach status endpoint: {state.message}. Please try refreshing — if
        the page itself isn&rsquo;t loading, then the answer to &ldquo;is Blackglass
        up?&rdquo; is unfortunately &ldquo;not right now.&rdquo;
      </div>
    );
  }

  const { snapshot } = state;
  const headline = HEADLINES[snapshot.status];

  return (
    <div className="space-y-6">
      <div
        className={`flex items-center gap-4 rounded-card border p-6 ${headline.cls}`}
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 shrink-0 rounded-full bg-current"
        />
        <div>
          <h2 className="text-base font-semibold">{headline.title}</h2>
          <p className="mt-1 text-xs opacity-80">{headline.subtitle}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {Object.entries(snapshot.components).map(([key, comp]) => (
          <li
            key={key}
            className="flex items-center justify-between rounded-card border border-border-default bg-bg-panel px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-fg-primary">
                {COMPONENT_LABELS[key] ?? key}
              </p>
              <p className="mt-0.5 text-xs text-fg-faint">
                {COMPONENT_DESCRIPTIONS[key] ?? "—"}
              </p>
            </div>
            <ComponentBadge component={comp} />
          </li>
        ))}
      </ul>

      <p className="text-xs text-fg-faint">
        Checked at {new Date(snapshot.checkedAt).toLocaleString()} ·{" "}
        probe wall time {snapshot.durationMs}ms · auto-refreshes every 30 seconds.
      </p>
    </div>
  );
}

const HEADLINES = {
  operational: {
    title: "All systems operational",
    subtitle:
      "Every component is responding within its target latency. You\u2019re good.",
    cls: "border-success/40 bg-success-soft/30 text-success",
  },
  degraded: {
    title: "Degraded performance",
    subtitle:
      "At least one component is responding slower than expected or returning errors. The console may still work but some flows could be slow.",
    cls: "border-warning/40 bg-warning-soft/30 text-warning",
  },
  down: {
    title: "Major outage",
    subtitle: "A critical component is unavailable. We\u2019re paged and working on it.",
    cls: "border-danger/40 bg-danger-soft/30 text-danger",
  },
} as const;

function ComponentBadge({ component }: { component: Component }) {
  if (component.status === "not_configured") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-2.5 py-1 text-xs font-medium text-fg-faint">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-fg-faint" aria-hidden />
        Not in this deployment
      </span>
    );
  }
  if (component.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success-soft/40 px-2.5 py-1 text-xs font-medium text-success">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
        Operational
        {typeof component.latencyMs === "number" && component.latencyMs > 0 ? (
          <span className="opacity-70">· {component.latencyMs}ms</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft/40 px-2.5 py-1 text-xs font-medium text-danger">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
      Down
      {typeof component.latencyMs === "number" && component.latencyMs > 0 ? (
        <span className="opacity-70">· {component.latencyMs}ms</span>
      ) : null}
    </span>
  );
}
