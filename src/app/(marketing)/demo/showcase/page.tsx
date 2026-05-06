"use client";

/**
 * /demo/showcase — full-screen, chrome-free live sandbox feed.
 * Designed for embedding in sales decks, outreach emails, and blog posts.
 * No nav, no sign-up prompts — just the live drift feed.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

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
    seedPhase: number;
    region: string;
    driftSeededAt: string | null;
  } | null;
  recentEvents: ShowcaseEvent[];
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  info: "bg-fg-faint",
};

const SEV_LABEL: Record<Severity, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  info: "text-fg-faint",
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

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ShowcasePage() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [newEvent, setNewEvent] = useState<ShowcaseEvent | null>(null);
  const prevPhaseRef = useRef<number>(-1);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/public/sandbox-showcase", { cache: "no-store" });
        if (!res.ok) return;
        const next: ShowcaseData = await res.json();
        setData((prev) => {
          const prevPhase = prev?.sandbox?.seedPhase ?? -1;
          const nextPhase = next?.sandbox?.seedPhase ?? -1;
          if (nextPhase > prevPhase && next.recentEvents.length > 0) {
            setNewEvent(next.recentEvents[0]);
          }
          return next;
        });
        prevPhaseRef.current = next?.sandbox?.seedPhase ?? -1;
      } catch {
        // silent
      }
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);

  const phase = data?.sandbox?.seedPhase ?? 0;
  const nextHint = NEXT_SCENE[phase] ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-bg-base text-fg-primary">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-border-default bg-bg-panel px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint hover:text-fg-primary">
            BLACKGLASS
          </Link>
          <span className="text-fg-faint">/</span>
          <span className="text-sm font-medium text-fg-primary">Live showcase</span>
        </div>
        <div className="flex items-center gap-4">
          {data?.status === "online" ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live · region {data.sandbox?.region ?? "lon1"}
            </span>
          ) : data?.status === "provisioning" ? (
            <span className="flex items-center gap-1.5 text-xs text-accent-blue">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-blue" />
              Provisioning…
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Offline — refreshes automatically
            </span>
          )}
          <TrialSignupLink className="rounded-card bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover">
            Start free trial
          </TrialSignupLink>
        </div>
      </header>

      {/* Main two-column layout */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">

        {/* Left: live findings feed */}
        <section className="flex-1 rounded-card border border-border-default bg-bg-panel p-5">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-fg-primary">
              Drift findings
              {data?.recentEvents.length ? (
                <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                  {data.recentEvents.length}
                </span>
              ) : null}
            </h1>
            <span className="font-mono text-[9px] text-fg-faint">auto-refreshes every 10 s</span>
          </div>

          {!data ? (
            <p className="mt-10 text-center text-sm text-fg-faint">Connecting…</p>
          ) : !data.recentEvents.length ? (
            <p className="mt-10 text-center text-sm text-fg-faint">
              No drift events yet — baseline capture in progress.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.recentEvents.map((e, idx) => (
                <li
                  key={e.phase}
                  className={`rounded-md border border-border-subtle bg-bg-elevated px-3 py-3 transition-all ${idx === 0 ? "border-l-2 border-l-red-500" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[e.severity as Severity]}`} />
                      <div>
                        <p className="text-sm font-medium text-fg-primary">{e.title}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-fg-faint">
                          {e.category} · scene {e.phase}
                          {e.detectedAt ? ` · detected ${fmt(e.detectedAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${SEV_LABEL[e.severity as Severity]}`}>
                      {e.severity}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right: context panel */}
        <aside className="flex w-full flex-col gap-4 lg:w-72">

          {/* Progress */}
          <section className="rounded-card border border-border-default bg-bg-panel p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-faint">Attack scenario progress</h2>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle">
                <div
                  className="h-full rounded-full bg-red-500 transition-all duration-700"
                  style={{ width: `${(phase / 8) * 100}%` }}
                />
              </div>
              <span className="font-mono text-xs text-fg-muted">{phase}/8</span>
            </div>
            {nextHint && (
              <p className="mt-2 text-[11px] text-fg-faint">{nextHint}</p>
            )}
          </section>

          {/* Contextual CTA on latest event */}
          {newEvent && (
            <section className="rounded-card border border-red-500/30 bg-red-500/6 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Just detected</p>
              <p className="mt-1.5 font-medium text-fg-primary">{newEvent.title}</p>
              <p className="mt-1 text-xs text-fg-muted">
                Blackglass flagged this in under 10 seconds. Your team would receive an alert before the attacker moves laterally.
              </p>
              <TrialSignupLink className="mt-3 block w-full rounded-md bg-accent-blue py-2 text-center text-xs font-semibold text-white hover:bg-accent-blue-hover">
                Start free trial — alert your real fleet
              </TrialSignupLink>
            </section>
          )}

          {/* What this is */}
          <section className="rounded-card border border-border-default bg-bg-panel p-4 text-xs text-fg-muted">
            <h2 className="font-semibold text-fg-primary">How this works</h2>
            <ul className="mt-2 space-y-1.5 leading-relaxed">
              <li>· A real Ubuntu 22.04 Droplet owned by Blackglass</li>
              <li>· Attack scenarios are scripted and seeded automatically</li>
              <li>· Blackglass scans via SSH every ~10 min and diffs against the baseline</li>
              <li>· No sign-up. No SSH keys from you.</li>
            </ul>
            <Link href="/demo/sandbox" className="mt-3 block text-accent-blue hover:underline">
              Full sandbox view →
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
