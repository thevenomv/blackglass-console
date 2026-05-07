"use client";

/**
 * /demo/sandbox — live feed of the Blackglass showcase sandbox.
 *
 * Shows real scan data from a Blackglass-owned VM that has drift seeded on a
 * rolling schedule. No sign-up required — fully public, read-only.
 *
 * Data comes from GET /api/public/sandbox-showcase and refreshes every 10 s.
 */

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

type Severity = "critical" | "high" | "medium" | "info";

type ShowcaseEvent = {
  phase: number;
  title: string;
  category: string;
  severity: Severity;
  detectedAt: string | null;
  rationale?: string;
  suggestedActions?: string[];
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
    lastSeededAt: string | null;
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

const NEXT_SCENE: Record<number, string> = {
  0: "Baseline capture in progress",
  1: "Next: NOPASSWD sudoers entry",
  2: "Next: Rogue user account",
  3: "Next: Rogue user → sudo group",
  4: "Next: sshd PermitRootLogin yes",
  5: "Next: Cron C2 beacon",
  6: "Next: SUID binary planted",
  7: "Next: World-writable /etc/passwd",
  8: "All scenarios applied — resetting shortly",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Returns a human-readable "~X min" string until the given ISO timestamp, or null if expired/unavailable. */
function etaFromNow(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60_000);
  return mins <= 1 ? "< 1 min" : `~${mins} min`;
}

export default function SandboxShowcasePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-fg-faint">Loading…</div>}>
      <SandboxShowcaseInner />
    </Suspense>
  );
}

function SandboxShowcaseInner() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [newEvent, setNewEvent] = useState<ShowcaseEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const prevPhaseRef = useRef<number>(-1);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Honour ?scene=N from URL — multiple writers to expandedPhase
  // (this URL sync, the user click handler, the poll handler) so a
  // pure derived-from-searchParams approach would lose the imperative
  // updates. Suppress: this is intentional URL→state sync.
  useEffect(() => {
    const sceneParam = searchParams.get("scene");
    if (sceneParam !== null) {
      const n = parseInt(sceneParam, 10);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!isNaN(n)) setExpandedPhase(n);
    }
  }, [searchParams]);

  const setSceneParam = useCallback((phase: number | null) => {
    const url = new URL(window.location.href);
    if (phase === null) {
      url.searchParams.delete("scene");
    } else {
      url.searchParams.set("scene", String(phase));
    }
    router.replace(url.pathname + url.search, { scroll: false });
    setExpandedPhase(phase);
  }, [router]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/public/sandbox-showcase", { cache: "no-store" });
        if (res.ok) {
          const next: ShowcaseData = await res.json();
          const nextPhase = next?.sandbox?.seedPhase ?? -1;
          if (nextPhase > prevPhaseRef.current && next.recentEvents.length > 0) {
            setNewEvent(next.recentEvents[0]);
            // Auto-expand latest finding when a new scene arrives
            setExpandedPhase(next.recentEvents[0].phase);
          }
          prevPhaseRef.current = nextPhase;
          setData(next);
        }
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

  const handleShare = useCallback((phase: number) => {
    const url = `${window.location.origin}/demo/sandbox?scene=${phase}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleLeadSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (leadStatus === "sending" || leadStatus === "sent") return;
    setLeadStatus("sending");
    try {
      const res = await fetch("/api/public/sandbox-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leadEmail }),
      });
      setLeadStatus(res.ok ? "sent" : "error");
    } catch {
      setLeadStatus("error");
    }
  }, [leadEmail, leadStatus]);

  const phase = data?.sandbox?.seedPhase ?? 0;

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
          <Link
            href="/demo/showcase"
            className="rounded-card border border-border-default px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg-elevated"
          >
            Full-screen view →
          </Link>
          <TrialSignupLink className="rounded-card bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-accent-blue-hover">
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
              Drift phase {data?.sandbox?.seedPhase ?? 0}/8
            </span>
            {data?.sandbox?.lastSeededAt && (
              <span className="ml-3 font-mono text-xs text-fg-faint">
                · last seeded {fmt(data.sandbox.lastSeededAt)}
              </span>
            )}
          </span>
        </StatusBar>
      )}

      {/* Contextual CTA when a new event arrives */}
      {newEvent && (
        <div className="flex flex-col gap-3 rounded-card border border-red-500/30 bg-red-500/6 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Just detected</p>
            <p className="mt-1 text-sm font-medium text-fg-primary">{newEvent.title}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Blackglass flagged this in under 10 seconds. Your fleet would receive an alert before an attacker moves laterally.
            </p>
          </div>
          <TrialSignupLink className="shrink-0 rounded-card bg-accent-blue px-4 py-2 text-xs font-semibold text-white hover:bg-accent-blue-hover">
            Alert your real fleet →
          </TrialSignupLink>
        </div>
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
              {data.recentEvents.map((e) => {
                const isExpanded = expandedPhase === e.phase;
                return (
                  <li
                    key={e.phase}
                    className={`rounded-md border px-3 py-2.5 ${SEV_COLOR[e.severity as Severity]}`}
                  >
                    {/* Row header */}
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setSceneParam(isExpanded ? null : e.phase)}
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
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.severity === "critical" ? "text-red-400" : e.severity === "high" ? "text-orange-400" : "text-amber-400"}`}
                        >
                          {e.severity}
                        </span>
                        <span className="text-[10px] text-fg-faint">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3 border-t border-border-subtle pt-3">
                        {e.rationale && (
                          <p className="text-xs text-fg-muted leading-relaxed">{e.rationale}</p>
                        )}
                        {e.suggestedActions && e.suggestedActions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Suggested actions</p>
                            <ul className="mt-1.5 space-y-1">
                              {e.suggestedActions.map((a, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-fg-muted">
                                  <span className="mt-0.5 shrink-0 text-fg-faint">→</span>
                                  <span>{a}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleShare(e.phase)}
                          className="mt-1 text-[10px] font-medium text-fg-faint hover:text-fg-muted"
                        >
                          {copied ? "✓ Link copied" : "⎘ Copy shareable link"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
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
            {/* Upcoming scene hint / reset ETA */}
            {phase < 8 && NEXT_SCENE[phase] && (
              <p className="mt-3 rounded-md border border-border-subtle bg-bg-elevated px-2.5 py-2 text-[10px] text-fg-faint">
                ⏱ {NEXT_SCENE[phase]}
              </p>
            )}
            {phase === 8 && (
              <p className="mt-3 rounded-md border border-border-subtle bg-bg-elevated px-2.5 py-2 text-[10px] text-fg-faint">
                ⏱ All scenarios applied
                {etaFromNow(data?.sandbox?.ttlExpiresAt ?? null)
                  ? ` — VM resets in ${etaFromNow(data?.sandbox?.ttlExpiresAt ?? null)}`
                  : " — resetting shortly"}
              </p>
            )}
          </section>

          {/* Lead capture — email the scan report */}
          <section className="rounded-card border border-border-default bg-bg-panel p-4">
            <h2 className="text-sm font-semibold text-fg-primary">Get the full report</h2>
            <p className="mt-1 text-xs text-fg-muted">
              We&apos;ll email you a PDF scan report from this VM showing all 8 drift findings.
            </p>
            {leadStatus === "sent" ? (
              <p className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
                ✓ Report on its way — check your inbox.
              </p>
            ) : (
              <form onSubmit={handleLeadSubmit} className="mt-3 flex flex-col gap-2">
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  className="w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-xs text-fg-primary placeholder:text-fg-faint focus:border-accent-blue focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={leadStatus === "sending"}
                  className="rounded-md bg-accent-blue px-3 py-2 text-xs font-semibold text-white hover:bg-accent-blue-hover disabled:opacity-50"
                >
                  {leadStatus === "sending" ? "Sending…" : "Email me the report"}
                </button>
                {leadStatus === "error" && (
                  <p className="text-[10px] text-red-400">Something went wrong — try again.</p>
                )}
              </form>
            )}
          </section>
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
