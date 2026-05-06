"use client";

/**
 * /demo/sandbox — live feed of the Blackglass showcase sandbox.
 *
 * Shows real scan data from a Blackglass-owned VM that has drift seeded on a
 * rolling schedule. No sign-up required — fully public, read-only.
 *
 * Data comes from GET /api/public/sandbox-showcase and refreshes every 10 s.
 */

import { useEffect, useState } from "react";
import { LaunchSandboxLink, TrialSignupLink } from "@/components/demo/DemoGateButton";

type Severity = "critical" | "high" | "medium" | "info";

type ShowcaseEvent = {
  phase: number;
  title: string;
  category: string;
  severity: Severity;
  detectedAt: string | null;
};

type ShowcaseData = {
  status: "online" | "provisioning" | "unavailable";
  sandbox: {
    id: string;
    status: string;
    region: string;
    seedPhase: number;
    driftSeededAt: string | null;
    ttlExpiresAt: string | null;
  } | null;
  recentEvents: ShowcaseEvent[];
};

const SEV_COLOR: Record<Severity, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/8",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/8",
  medium: "text-amber-400 border-amber-400/30 bg-amber-400/8",
  info: "text-fg-muted border-border-subtle bg-bg-elevated",
};

const CATEGORY_ICON: Record<string, string> = {
  LISTENERS: "⬡",
  SUDOERS: "⬣",
  USERS: "⬢",
  SUDO_GROUP: "◈",
  SSH_CONFIG: "⬡",
  CRON: "⬟",
  FILE_INTEGRITY: "⬧",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SandboxShowcasePage() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/public/sandbox-showcase", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {
        // silent — keep stale data
      } finally {
        setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Live sandbox</h1>
          <p className="mt-1 text-sm text-fg-muted">
            A real Ubuntu VM owned by Blackglass. Drift scenarios are seeded automatically —
            watch the findings update without connecting your own infrastructure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LaunchSandboxLink className="rounded-card bg-accent-blue px-3 py-2 text-sm font-medium text-white hover:bg-accent-blue-hover">
            Get your own sandbox
          </LaunchSandboxLink>
          <TrialSignupLink className="rounded-card border border-border-default px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg-elevated">
            Start free trial
          </TrialSignupLink>
        </div>
      </div>

      {/* Status bar */}
      {loading ? (
        <StatusBar color="border-fg-faint/20 bg-bg-elevated" dot="bg-fg-faint animate-pulse">
          Connecting to showcase VM…
        </StatusBar>
      ) : data?.status === "unavailable" ? (
        <StatusBar color="border-amber-400/30 bg-amber-400/8" dot="bg-amber-400">
          Showcase VM is temporarily offline — it refreshes every 4 hours.
        </StatusBar>
      ) : data?.status === "provisioning" ? (
        <StatusBar color="border-accent-blue/30 bg-accent-blue/8" dot="bg-accent-blue animate-pulse">
          Showcase VM is provisioning — check back in ~90 seconds.
        </StatusBar>
      ) : (
        <StatusBar color="border-emerald-500/30 bg-emerald-500/8" dot="bg-emerald-500">
          <span>
            VM online{" "}
            <span className="font-mono text-xs text-fg-faint">· region {data?.sandbox?.region ?? "lon1"}</span>
            <span className="ml-3 font-mono text-xs text-fg-faint">
              Drift phase {data?.sandbox?.seedPhase ?? 0}/8 · last seeded{" "}
              {fmt(data?.sandbox?.driftSeededAt ?? null)}
            </span>
          </span>
        </StatusBar>
      )}

      {/* Split: findings feed + VM info */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Findings feed — left 2 cols */}
        <section className="lg:col-span-2 rounded-card border border-border-default bg-bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-primary">
              Active drift findings
              {data?.recentEvents.length ? (
                <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                  {data.recentEvents.length}
                </span>
              ) : null}
            </h2>
            <span className="font-mono text-[9px] text-fg-faint">auto-refreshes every 10 s</span>
          </div>

          {!data?.recentEvents.length ? (
            <div className="mt-8 text-center text-sm text-fg-faint">
              {loading ? "Loading…" : "No drift events yet — VM may still be running baseline capture."}
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.recentEvents.map((e) => (
                <li
                  key={e.phase}
                  className={`flex flex-col gap-1 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${SEV_COLOR[e.severity as Severity]}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm" aria-hidden="true">
                      {CATEGORY_ICON[e.category] ?? "◆"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-fg-primary">{e.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-fg-faint">
                        {e.category} · scene {e.phase}
                        {e.detectedAt ? ` · detected ${fmt(e.detectedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.severity === "critical" ? "text-red-400" : e.severity === "high" ? "text-orange-400" : "text-amber-400"}`}
                  >
                    {e.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* VM details — right col */}
        <aside className="space-y-4">
          <section className="rounded-card border border-border-default bg-bg-panel p-4">
            <h2 className="text-sm font-semibold text-fg-primary">Showcase VM</h2>
            <dl className="mt-3 space-y-2 text-xs">
              {[
                ["Image", "Ubuntu 22.04 LTS"],
                ["Size", "1 vCPU / 1 GB RAM"],
                ["Region", data?.sandbox?.region ?? "lon1"],
                ["SSH user", "blackglass (scan-only)"],
                ["Inbound ports", "22 (SSH, key-only)"],
                ["Outbound", "Blocked — no egress post-init"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-fg-faint">{k}</dt>
                  <dd className="font-mono text-fg-muted text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-card border border-border-default bg-bg-panel p-4">
            <h2 className="text-sm font-semibold text-fg-primary">Drift schedule</h2>
            <ol className="mt-3 space-y-1.5 text-xs text-fg-muted">
              {[
                "Baseline capture",
                "Port listener (TCP 4444)",
                "NOPASSWD sudoers",
                "Rogue user account",
                "Sudo group escalation",
                "sshd PermitRootLogin yes",
                "Cron C2 beacon",
                "SUID binary",
                "World-writable /etc/passwd",
              ].map((label, i) => {
                const done = i > 0 && i <= (data?.sandbox?.seedPhase ?? 0);
                const active = i === (data?.sandbox?.seedPhase ?? 0) && i > 0;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${done || active ? "bg-red-400" : "bg-border-subtle"}`}
                    />
                    <span className={done ? "text-fg-primary" : "text-fg-faint"}>{label}</span>
                    {active && (
                      <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-red-400">
                        latest
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="rounded-card border border-accent-blue/30 bg-accent-blue/8 p-4 text-sm">
            <p className="font-medium text-fg-primary">Want your own?</p>
            <p className="mt-1 text-xs text-fg-muted">
              Sign up and click <strong>Launch live sandbox</strong> — a private VM is provisioned in
              under 2 minutes. You never touch SSH keys.
            </p>
            <LaunchSandboxLink className="mt-3 block w-full rounded-md bg-accent-blue py-2 text-center text-xs font-semibold text-white hover:bg-accent-blue-hover" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusBar({
  children,
  color,
  dot,
}: {
  children: React.ReactNode;
  color: string;
  dot: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-card border px-4 py-2.5 text-sm text-fg-primary ${color}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span>{children}</span>
    </div>
  );
}
