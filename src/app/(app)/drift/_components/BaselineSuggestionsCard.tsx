"use client";

/**
 * Surfaces the frequency-based baseline-suggestion heuristic shipped
 * in wave 8 (P3 #50). Renders as a dismissible card at the top of
 * the Drift page when the suggester finds at least one
 * (category, title) tuple recurring across N+ hosts that the
 * operator has already accepted or muted — i.e. patterns that are
 * noise the customer has decided is fine.
 *
 * Behaviour:
 *   - Fetches GET /api/v1/drift/baseline-suggestions on mount
 *   - Renders nothing if the response is empty (the common case for
 *     small fleets) or if the user has dismissed the card this
 *     session
 *   - Sticky-dismisses for the rest of the browser session via
 *     sessionStorage so the operator isn't nagged after they've
 *     seen it once
 *
 * Promotion to the baseline is a per-host action and lives on the
 * existing `/api/v1/drift/accept-baseline` endpoint. The card just
 * surfaces the suggestion + deep-links to a pre-filtered drift
 * query the operator can act on.
 */

import { useEffect, useState } from "react";

interface Suggestion {
  category: string;
  title: string;
  hostCount: number;
  lastSeenAt: string;
  matchedByMute: boolean;
  sampleHostIds: string[];
}

interface SuggestionResponse {
  suggestions: Suggestion[];
  config: {
    minHosts: number;
    minAgeDays: number;
  };
}

const DISMISS_KEY = "blackglass.drift.suggestions.dismissed";

export function BaselineSuggestionsCard() {
  const [response, setResponse] = useState<SuggestionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") {
        // Read sessionStorage on mount; can't be derived state because
        // sessionStorage is an external (browser) source of truth.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(true);
      }
    } catch {
      // sessionStorage can throw in private mode / sandboxed iframes.
      // Treat as undismissed; the user can dismiss again if they care.
    }
    void (async () => {
      try {
        const res = await fetch("/api/v1/drift/baseline-suggestions?limit=5", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as SuggestionResponse;
        if (!cancelled) setResponse(json);
      } catch {
        // Swallow — the card is non-critical decoration; if the
        // endpoint is misconfigured the operator still has the full
        // drift table below.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // see note above
    }
  };

  if (dismissed || !response || response.suggestions.length === 0) return null;

  return (
    <section className="rounded-card border border-accent-blue/30 bg-accent-blue/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-blue">
            Baseline-promotion suggestions
          </p>
          <p className="mt-1 text-sm text-fg-primary">
            {response.suggestions.length} pattern
            {response.suggestions.length === 1 ? "" : "s"} appear
            on{" "}
            <span className="font-mono">
              {response.config.minHosts}+
            </span>{" "}
            hosts and have already been accepted or muted. Promote
            them into the baseline so they stop showing as drift.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-fg-faint transition-colors hover:text-fg-muted focus:outline-none"
          aria-label="Dismiss suggestions"
        >
          Dismiss
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {response.suggestions.map((s) => (
          <li
            key={`${s.category}::${s.title}`}
            className="flex items-center justify-between gap-3 rounded border border-border-subtle bg-bg-panel px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {s.category}
                </span>
                <span className="truncate text-fg-primary">{s.title}</span>
                {s.matchedByMute ? (
                  <span className="rounded bg-warning-soft/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                    muted
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-fg-faint">
                {s.hostCount} host{s.hostCount === 1 ? "" : "s"} ·
                last seen{" "}
                {new Date(s.lastSeenAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <a
              href={`/drift?q=${encodeURIComponent(s.title)}`}
              className="shrink-0 text-accent-blue hover:underline"
            >
              Review
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-fg-faint">
        Tunable via <code className="font-mono">BASELINE_SUGGESTION_MIN_HOSTS</code>{" "}
        (currently <span className="font-mono">{response.config.minHosts}</span>) +{" "}
        <code className="font-mono">BASELINE_SUGGESTION_MIN_AGE_DAYS</code>{" "}
        (currently <span className="font-mono">{response.config.minAgeDays}</span>).
      </p>
    </section>
  );
}
