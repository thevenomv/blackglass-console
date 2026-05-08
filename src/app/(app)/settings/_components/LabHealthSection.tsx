"use client";

/**
 * Lab health — pre-flight check for the long-lived sales-demo VM
 * (`blackglass-lab-01`). Catches the four common ways a demo silently
 * breaks between calls (firewall regression, sshd down, port mismatch,
 * env unset) so the operator sees red BEFORE getting on the call.
 *
 * Visible only to owner / admin (the underlying API already 403s).
 * Refreshes manually only — there's no point hammering the SSH probe
 * on a 30-second timer.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type LabHealth = {
  configured: boolean;
  host: string | null;
  hostName: string | null;
  port: number;
  tcpReachable: boolean;
  sshBanner: string | null;
  bannerLooksHealthy: boolean;
  probedAt: string;
  latencyMs: number;
  warnings: string[];
};

function statusColor(h: LabHealth | null): string {
  if (!h) return "text-fg-faint";
  if (!h.configured) return "text-fg-faint";
  if (!h.tcpReachable || !h.bannerLooksHealthy) return "text-danger";
  if (h.warnings.length > 0) return "text-warning";
  return "text-success";
}

function statusLabel(h: LabHealth | null): string {
  if (!h) return "Probing…";
  if (!h.configured) return "Not configured";
  if (!h.tcpReachable) return "Unreachable";
  if (!h.bannerLooksHealthy) return "TCP open, sshd not responding";
  if (h.warnings.length > 0) return "Reachable (with warnings)";
  return "Healthy";
}

export function LabHealthSection() {
  const [health, setHealth] = useState<LabHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/lab-health", { cache: "no-store" });
      if (r.status === 403) {
        setError("Owner / admin role required.");
        return;
      }
      if (!r.ok) {
        setError(`Probe failed: HTTP ${r.status}`);
        return;
      }
      setHealth((await r.json()) as LabHealth);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    // Initial mount fetch only — manual refresh after that. SSH banner
    // probes have a 5-second timeout so we don't want them on a timer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
  }, [fetchOnce]);

  if (error) {
    return <p className="text-xs text-fg-faint">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-faint">
          Probes <code className="font-mono">COLLECTOR_HOST_1</code> over TCP and
          reads the SSH banner. Run this BEFORE prospect calls to catch
          firewall regressions / sshd outages / port mismatches early.
        </p>
        <Button variant="secondary" disabled={loading} onClick={refresh}>
          {loading ? "Probing…" : "Probe now"}
        </Button>
      </div>

      <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              Status
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${statusColor(health)}`}>
              {statusLabel(health)}
            </p>
          </div>
          {health ? (
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                Latency
              </p>
              <p className="mt-0.5 font-mono text-sm text-fg-primary">
                {health.latencyMs} ms
              </p>
            </div>
          ) : null}
        </div>

        {health?.configured ? (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-fg-faint">Host</dt>
              <dd className="font-mono text-fg-primary">
                {health.hostName ? `${health.hostName} · ` : ""}
                {health.host}:{health.port}
              </dd>
            </div>
            <div>
              <dt className="text-fg-faint">SSH banner</dt>
              <dd
                className={`font-mono ${health.bannerLooksHealthy ? "text-fg-primary" : "text-warning"}`}
              >
                {health.sshBanner ?? "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-fg-faint">Last probed</dt>
              <dd className="font-mono text-fg-muted" title={health.probedAt}>
                {new Date(health.probedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-xs text-fg-faint">
            Set <code className="font-mono">COLLECTOR_HOST_1</code>,
            <code className="ml-1 font-mono">COLLECTOR_HOST_1_NAME</code>, and
            <code className="ml-1 font-mono">COLLECTOR_PORT</code> on the
            web service to enable the demo VM probe.
          </p>
        )}

        {health && health.warnings.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded border border-warning/40 bg-warning-soft-bg p-3 text-xs text-warning">
            {health.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}

        {health?.configured && health.tcpReachable && health.bannerLooksHealthy ? (
          <p className="mt-3 text-xs text-fg-muted">
            Lab VM is good to go. Run{" "}
            <code className="font-mono">scripts/lab/seed-drift.sh</code> +
            capture a baseline before the call (see{" "}
            <a
              href="/docs/sales-demo-walkthrough"
              className="text-accent-blue hover:underline"
            >
              sales walkthrough
            </a>
            ).
          </p>
        ) : null}
      </div>
    </div>
  );
}
