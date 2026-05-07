"use client";

/**
 * Persistent dashboard onboarding checklist.
 *
 * Five-step "do this next" panel that auto-dismisses once complete.
 *
 * Detection vs manual tick:
 *   1. Connect host          — auto: derived server-side from collector config
 *   2. Capture baseline      — auto: derived server-side from fleet.hostsChecked
 *   3. Run first scan        — auto: derived server-side from fleet.hostsChecked
 *   4. Configure alerts      — manual tick (link to /settings → Notifications)
 *   5. Invite a teammate     — manual tick (link to /settings → Team)
 *
 * Manual ticks + dismissal persist in localStorage keyed by workspace, so
 * each tenant has its own checklist. Server-detected steps always reflect
 * live truth — flipping the manual ticks doesn't fake them as done.
 */

import Link from "next/link";
import { useMemo, useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "blackglass.dashboard.onboarding.v1";
const MANUAL_KEYS = ["alerts", "team"] as const;
type ManualKey = (typeof MANUAL_KEYS)[number];

interface PersistedState {
  manuallyDone: ManualKey[];
  dismissedAt: string | null;
}

// ---------------------------------------------------------------------------
// External store: localStorage-backed state exposed to React via
// useSyncExternalStore. This avoids `setState`-in-effect (which the linter
// flags) and means the panel automatically reflects changes from another
// browser tab without a reload.
// ---------------------------------------------------------------------------

const SERVER_SNAPSHOT: PersistedState = { manuallyDone: [], dismissedAt: null };
let cachedSnapshot: PersistedState | null = null;
const listeners = new Set<() => void>();

function readSnapshot(): PersistedState {
  if (cachedSnapshot) return cachedSnapshot;
  if (typeof window === "undefined") {
    // Don't cache the server snapshot — the same module is reused for the
    // client render after hydration and we want to fall through to localStorage
    // there. Returning the shared SERVER_SNAPSHOT identity also lets the
    // component below distinguish "still hydrating" from "loaded".
    return SERVER_SNAPSHOT;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Always a fresh object so identity differs from SERVER_SNAPSHOT —
      // the component uses that distinction to know it's hydrated.
      cachedSnapshot = { manuallyDone: [], dismissedAt: null };
      return cachedSnapshot;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    cachedSnapshot = {
      manuallyDone: Array.isArray(parsed.manuallyDone)
        ? parsed.manuallyDone.filter((k): k is ManualKey =>
            (MANUAL_KEYS as readonly string[]).includes(k as string),
          )
        : [],
      dismissedAt: typeof parsed.dismissedAt === "string" ? parsed.dismissedAt : null,
    };
    return cachedSnapshot;
  } catch {
    cachedSnapshot = { manuallyDone: [], dismissedAt: null };
    return cachedSnapshot;
  }
}

function commit(next: PersistedState) {
  cachedSnapshot = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota / private-mode failure: state still updates in-memory,
      // it just won't survive a reload.
    }
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedSnapshot = null; // re-parse on next read
      onChange();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handler);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handler);
    }
  };
}

export interface OnboardingChecklistProps {
  /** Server-detected: at least one collector host is configured. */
  hostConnected: boolean;
  /** Server-detected: a baseline exists for at least one host. */
  baselineCaptured: boolean;
  /** Server-detected: at least one host has been scanned. */
  scanRun: boolean;
}

interface StepDef {
  id: "host" | "baseline" | "scan" | ManualKey;
  label: string;
  detail: string;
  done: boolean;
  cta: { href: string; text: string };
  /** Whether the user can manually tick this off (no server signal). */
  manual?: boolean;
}

function CheckIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-default text-fg-faint">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function OnboardingChecklist({
  hostConnected,
  baselineCaptured,
  scanRun,
}: OnboardingChecklistProps) {
  const state = useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);
  // useSyncExternalStore returns the server snapshot during SSR and the
  // initial render — that's exactly the "hydrated guard" the previous version
  // implemented manually.
  const hydrated = state !== SERVER_SNAPSHOT;

  const toggleManual = useCallback((key: ManualKey, done: boolean) => {
    const prev = readSnapshot();
    commit({
      ...prev,
      manuallyDone: done
        ? Array.from(new Set([...prev.manuallyDone, key]))
        : prev.manuallyDone.filter((k) => k !== key),
    });
  }, []);

  const dismiss = useCallback(() => {
    const prev = readSnapshot();
    commit({ ...prev, dismissedAt: new Date().toISOString() });
  }, []);

  const steps = useMemo<StepDef[]>(
    () => [
      {
        id: "host",
        label: "Connect a host",
        detail: hostConnected
          ? "At least one collector host is configured."
          : "Add an SSH host or install the push agent — the wizard walks you through both.",
        done: hostConnected,
        cta: { href: "/onboarding", text: "Run setup wizard" },
      },
      {
        id: "baseline",
        label: "Capture a baseline",
        detail: baselineCaptured
          ? "Baseline pinned — every future scan diffs against this snapshot."
          : "Capture the current good state. Future scans diff against it to surface drift.",
        done: baselineCaptured,
        cta: { href: "/baselines", text: "Open baselines" },
      },
      {
        id: "scan",
        label: "Run your first scan",
        detail: scanRun
          ? "Fleet has been scanned at least once."
          : "Triggers the collector and writes the first integrity snapshot.",
        done: scanRun,
        cta: { href: "/dashboard", text: "Use Run scan above" },
      },
      {
        id: "alerts",
        label: "Configure alerts",
        detail:
          "Send drift findings to Slack, PagerDuty, or a webhook so you don't have to check the dashboard manually.",
        done: state.manuallyDone.includes("alerts"),
        cta: { href: "/settings#notifications", text: "Open notification settings" },
        manual: true,
      },
      {
        id: "team",
        label: "Invite a teammate",
        detail:
          "Bring at least one teammate into the workspace so on-call coverage isn't a single-person bottleneck.",
        done: state.manuallyDone.includes("team"),
        cta: { href: "/settings#team", text: "Open team settings" },
        manual: true,
      },
    ],
    [hostConnected, baselineCaptured, scanRun, state.manuallyDone],
  );

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  // Don't render anything before we read localStorage (avoids hydration flicker
  // showing the panel for one frame and then collapsing it).
  if (!hydrated) return null;
  if (state.dismissedAt) return null;
  if (allDone) return null;

  return (
    <section
      role="region"
      aria-label="Onboarding checklist"
      className="overflow-hidden rounded-card border border-border-default bg-bg-panel"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Get set up
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-fg-primary">
            {completed} of {total} done — finish setup to unlock the full workflow
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary"
          title="Dismiss this checklist (it stays hidden until cleared from settings)"
        >
          Dismiss
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full bg-bg-base">
        <div
          className="h-full bg-accent-blue transition-all"
          style={{ width: `${(completed / total) * 100}%` }}
          aria-hidden
        />
      </div>

      <ul className="divide-y divide-border-subtle">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 px-4 py-3">
            <CheckIcon done={step.done} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? "text-fg-muted line-through" : "text-fg-primary"}`}>
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">{step.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {step.manual && !step.done ? (
                <button
                  type="button"
                  onClick={() => toggleManual(step.id as ManualKey, true)}
                  className="rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary"
                  title="Mark this step as done"
                >
                  Mark done
                </button>
              ) : null}
              {step.manual && step.done ? (
                <button
                  type="button"
                  onClick={() => toggleManual(step.id as ManualKey, false)}
                  className="rounded-md border border-border-default px-2 py-1 text-xs text-fg-faint transition-colors hover:border-border-strong hover:text-fg-muted"
                  title="Undo: mark this step as not done"
                >
                  Undo
                </button>
              ) : null}
              {!step.done ? (
                <Link
                  href={step.cta.href}
                  className="rounded-md bg-accent-blue px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  {step.cta.text}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
