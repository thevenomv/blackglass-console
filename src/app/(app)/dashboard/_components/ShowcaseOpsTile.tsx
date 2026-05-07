"use client";

/**
 * ShowcaseOpsTile — operator visibility into the public sandbox showcase.
 *
 * Polls /api/admin/showcase every 30s and renders a one-glance status:
 * sandbox status badge, TTL countdown, current seed phase, droplet ID
 * (links to the DO console), and the most recent error message if any.
 *
 * Self-hides when:
 *   - the endpoint returns 401/403 (user is not signed into a tenant), or
 *   - the response is `{ enabled: false }` (showcase env vars not set —
 *     this is a normal state for self-hosted installs and shouldn't
 *     clutter their dashboard).
 *
 * Surfacing this on the regular tenant dashboard is intentional: BLACKGLASS
 * staff who run the public showcase are signed into the showcase tenant
 * (clerk_org_id="showcase-public-demo") and will see the tile when they're
 * viewing that tenant. Other tenants see nothing because the auto-provision
 * tenant filter targets a single tenant ID — there is no sandbox row for
 * them to render.
 *
 * Wave 11 deliverable. Replaces the ad-hoc PowerShell + DO API workflow we
 * used during the 2026-05-07 incident to diagnose "Showcase VM offline".
 */

import { useEffect, useState } from "react";

interface SandboxView {
  id: string;
  status: string;
  region: string;
  seedPhase: number;
  dropletId: string | null;
  dropletIp: string | null;
  hostId: string | null;
  firewallId: string | null;
  ttlExpiresAt: string | null;
  secondsUntilExpiry: number | null;
  driftSeededAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
}

interface AdminShowcaseResponse {
  enabled: boolean;
  reason?: string;
  sandbox?: SandboxView | null;
}

type Tone = "ok" | "warn" | "danger" | "muted";

const POLL_INTERVAL_MS = 30_000;

function statusTone(status: string | undefined): Tone {
  if (!status) return "muted";
  if (status === "ready" || status === "seeding") return "ok";
  if (status === "provisioning") return "warn";
  if (status === "error") return "danger";
  return "muted";
}

function toneClasses(t: Tone) {
  if (t === "ok") return { card: "border-success/40 bg-success-soft/15", badge: "bg-success-soft text-success" };
  if (t === "warn") return { card: "border-warning/40 bg-warning-soft/15", badge: "bg-warning-soft text-warning" };
  if (t === "danger") return { card: "border-danger/50 bg-danger-soft/20", badge: "bg-danger-soft text-danger" };
  return { card: "border-border-subtle bg-bg-elevated", badge: "bg-bg-panel text-fg-muted" };
}

function formatTtl(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 0) return `expired ${formatDuration(-seconds)} ago`;
  return `${formatDuration(seconds)} remaining`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

export function ShowcaseOpsTile() {
  const [data, setData] = useState<AdminShowcaseResponse | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetch("/api/admin/showcase", { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) {
          setHidden(true);
          return;
        }
        if (!r.ok) {
          setError(`HTTP ${r.status}`);
          return;
        }
        const body: AdminShowcaseResponse = await r.json();
        if (body.enabled === false) {
          setHidden(true);
          return;
        }
        setData(body);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (hidden) return null;

  if (!data && !error) {
    return (
      <section className="rounded-card border border-border-subtle bg-bg-elevated p-4">
        <p className="text-xs font-medium uppercase tracking-widest text-fg-faint">Showcase ops</p>
        <p className="mt-2 text-sm text-fg-muted">Loading…</p>
      </section>
    );
  }

  const sandbox = data?.sandbox ?? null;
  const t = toneClasses(statusTone(sandbox?.status));

  return (
    <section
      aria-label="Showcase sandbox operator panel"
      className={`flex flex-col gap-3 rounded-card border p-4 ${t.card}`}
    >
      <header className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-fg-faint">Showcase ops</p>
        {sandbox && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-xs ${t.badge}`}>
            {sandbox.status}
          </span>
        )}
      </header>

      {error && <p className="text-xs text-danger">Probe failed: {error}</p>}

      {!sandbox && !error && (
        <p className="text-sm text-fg-muted">
          No active sandbox. Hit{" "}
          <a className="font-mono text-accent-blue underline" href="/api/public/sandbox-showcase">
            /api/public/sandbox-showcase
          </a>{" "}
          to trigger auto-provision (60s throttle).
        </p>
      )}

      {sandbox && (
        <>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Stat label="Region" value={sandbox.region} mono />
            <Stat label="Seed phase" value={`${sandbox.seedPhase}/8`} mono />
            <Stat label="TTL" value={formatTtl(sandbox.secondsUntilExpiry)} />
            <Stat
              label="Droplet"
              value={
                sandbox.dropletId ? (
                  <a
                    href={`https://cloud.digitalocean.com/droplets/${sandbox.dropletId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-accent-blue underline"
                  >
                    {sandbox.dropletId}
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </div>

          {sandbox.dropletIp && (
            <p className="font-mono text-[11px] text-fg-faint">IP {sandbox.dropletIp}</p>
          )}

          {sandbox.errorMessage && (
            <pre className="overflow-x-auto rounded-md border border-danger/30 bg-danger-soft/10 p-2 font-mono text-[11px] text-danger">
              {sandbox.errorMessage}
            </pre>
          )}

          {!sandbox.dropletId && sandbox.status !== "error" && (
            <p className="text-xs text-fg-muted">
              Sandbox row created but no Droplet yet — the in-process activator is still polling DO.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-panel px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""} text-fg-primary`}>{value}</p>
    </div>
  );
}
