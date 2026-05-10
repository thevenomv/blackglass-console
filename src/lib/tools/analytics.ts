/**
 * Lightweight client-side analytics shim for the Free Tools area.
 *
 * Why a shim, not a direct PostHog/Segment/etc. call?
 *   - The codebase needs to start measuring funnel events on day one but
 *     stay vendor-flexible — this shim fans an event out to every sink it
 *     can find, and silently no-ops where one isn't configured.
 *
 * Currently fans out to:
 *   1. **Plausible** (`window.plausible(name, { props })`) — the primary
 *      provider, loaded by `src/components/marketing/PlausibleScript.tsx`
 *      when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set. Cookie-free, no PII.
 *   2. **`window.dataLayer`** (GTM convention) — future-proof entry point
 *      for any tag manager / second analytics provider added later.
 *   3. **`console.debug`** — visible during local dev only.
 *
 * Usage:
 *   trackToolEvent("tool_estimator_opened", { tool: "cloud-waste-estimator" });
 *
 * Side effects:
 *   - Calls `window.plausible(name, { props })` if the global is defined.
 *     Plausible's queue shim catches calls fired before its script loads.
 *   - Pushes the event into `window.dataLayer` (creates the array if missing).
 *   - Logs at `console.debug` in dev so the events are visible while testing.
 *   - Never throws — analytics must never break a user-facing flow.
 */

export type ToolEventName =
  | "tool_estimator_opened"
  | "tool_estimator_recomputed"
  | "tool_checklist_downloaded"
  | "tool_email_submitted"
  | "tool_demo_cta_clicked"
  | "tool_charon_cta_clicked"
  | "tool_pricing_cta_clicked";

export interface ToolEventProps {
  /** Slug of the tool — `cloud-waste-estimator`, `linux-drift-risk`, etc. */
  tool?: string;
  /** Free-form surface tag — e.g. `result_panel`, `index_card`. */
  surface?: string;
  /** Optional numeric/string properties; kept loose on purpose. */
  [key: string]: string | number | boolean | undefined;
}

interface DataLayerEntry extends ToolEventProps {
  event: ToolEventName;
  /** ISO-8601 client timestamp at fire time. */
  ts: string;
}

/** Plausible's manual-events callable — see plausible.io/docs/custom-events. */
type PlausibleFn = (
  eventName: string,
  options?: { props?: Record<string, string | number | boolean | undefined> },
) => void;

interface WindowWithSinks {
  dataLayer?: DataLayerEntry[];
  plausible?: PlausibleFn;
}

export function trackToolEvent(name: ToolEventName, props: ToolEventProps = {}): void {
  if (typeof window === "undefined") return;

  const w = window as WindowWithSinks;

  // 1. Plausible — primary provider when configured. The official inline
  // shim (in PlausibleScript) queues calls fired before script load, so
  // it's safe to invoke without checking script readiness.
  try {
    if (typeof w.plausible === "function") {
      w.plausible(name, { props });
    }
  } catch {
    // ignore — never break the flow on analytics
  }

  // 2. dataLayer — GTM-compatible sink for any future provider.
  try {
    const payload: DataLayerEntry = {
      event: name,
      ts: new Date().toISOString(),
      ...props,
    };
    if (!Array.isArray(w.dataLayer)) {
      w.dataLayer = [];
    }
    w.dataLayer.push(payload);

    if (process.env.NODE_ENV !== "production") {
      console.debug("[tools/analytics]", payload);
    }
  } catch {
    // ignore
  }
}
