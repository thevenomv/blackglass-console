/**
 * Bridge: Sentry server-side errors → PagerDuty Events v2 incidents.
 *
 * When a server-side error reaches Sentry at `error` or `fatal` level we
 * also fire a PagerDuty Events v2 trigger so on-call gets a page without
 * relying on Sentry's own integration (some plans don't include it, and
 * this avoids the Sentry-side rules engine).
 *
 * Config:
 *   PD_ROUTING_KEY              — Events v2 routing key (re-used from
 *                                 the existing tenant-notifications env).
 *   PD_SENTRY_BRIDGE_ENABLED    — "true" to enable. Default off so the
 *                                 bridge is opt-in and never accidentally
 *                                 pages on a noisy Sentry stream.
 *   PD_SENTRY_MIN_LEVEL         — "error" (default) or "fatal".
 *   NEXT_PUBLIC_APP_URL         — used to build the deep-link back into
 *                                 the Blackglass console.
 *
 * Behaviour:
 *   - Fire-and-forget. Failure is logged but never re-throws — the bridge
 *     must not crash the Sentry pipeline.
 *   - Deduped via PagerDuty's `dedup_key`: hash of the issue fingerprint
 *     so a tight loop of the same error opens one incident, not 1000.
 *   - 1500ms HTTP timeout — Sentry's `beforeSend` is on the request hot
 *     path; this can never block.
 *   - In-process throttle: 1 trigger per fingerprint per 60 seconds.
 *     Even if the dedup_key collapses on PagerDuty's side, we don't want
 *     to spam the API.
 */

import { createHash } from "node:crypto";
import { shouldSkipForAirgap } from "@/lib/server/airgap";

type PagerDutySeverity = "critical" | "error" | "warning" | "info";

const TRIGGER_TIMEOUT_MS = 1500;
const THROTTLE_WINDOW_MS = 60_000;
const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";

// In-process throttle map. Tied to the worker / route handler runtime —
// per-process is the right scope (Sentry is per-process too) and a
// restart resetting the throttle is acceptable.
const lastTriggerByFingerprint = new Map<string, number>();

function bridgeEnabled(): boolean {
  const raw = process.env.PD_SENTRY_BRIDGE_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function minLevel(): "error" | "fatal" {
  return process.env.PD_SENTRY_MIN_LEVEL?.trim().toLowerCase() === "fatal" ? "fatal" : "error";
}

function shouldTrigger(level: string | undefined): boolean {
  if (!level) return false;
  if (minLevel() === "fatal") return level === "fatal";
  return level === "error" || level === "fatal";
}

function fingerprintFromEvent(event: {
  fingerprint?: string[];
  message?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
}): string {
  if (event.fingerprint && event.fingerprint.length > 0) {
    return createHash("sha256").update(event.fingerprint.join("|")).digest("hex").slice(0, 24);
  }
  const exc = event.exception?.values?.[0];
  const seed = exc
    ? `${exc.type ?? ""}|${exc.value ?? ""}`
    : event.message ?? "unknown";
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

function severityFromLevel(level: string | undefined): PagerDutySeverity {
  if (level === "fatal") return "critical";
  if (level === "error") return "error";
  if (level === "warning") return "warning";
  return "info";
}

/**
 * Fire a PagerDuty trigger for a Sentry event. Safe to call from any
 * server-side context including `beforeSend` — never throws, never
 * blocks for more than `TRIGGER_TIMEOUT_MS`.
 */
export async function maybeTriggerPagerDuty(event: {
  level?: string;
  fingerprint?: string[];
  message?: string;
  event_id?: string;
  request?: { url?: string };
  exception?: { values?: Array<{ type?: string; value?: string }> };
}): Promise<void> {
  if (!bridgeEnabled()) return;
  if (!shouldTrigger(event.level)) return;
  // events.pagerduty.com is on the public internet — air-gapped
  // deployments must use a local PagerDuty proxy or skip this bridge
  // entirely. We refuse to attempt the call so on-call doesn't get
  // false-positive timeouts.
  if (shouldSkipForAirgap("pagerduty bridge", PAGERDUTY_EVENTS_URL)) return;

  const routingKey = process.env.PD_ROUTING_KEY?.trim();
  if (!routingKey) return;

  const fingerprint = fingerprintFromEvent(event);
  const now = Date.now();
  const last = lastTriggerByFingerprint.get(fingerprint);
  if (last !== undefined && now - last < THROTTLE_WINDOW_MS) {
    return;
  }
  lastTriggerByFingerprint.set(fingerprint, now);

  // Cap the throttle map at 1024 fingerprints — keeps a stuck worker
  // from leaking memory if it sees thousands of distinct errors.
  if (lastTriggerByFingerprint.size > 1024) {
    const oldest = Array.from(lastTriggerByFingerprint.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 256);
    for (const [k] of oldest) lastTriggerByFingerprint.delete(k);
  }

  const exc = event.exception?.values?.[0];
  const summary = exc
    ? `Blackglass Sentry: ${exc.type ?? "Error"} — ${exc.value ?? ""}`.slice(0, 1024)
    : `Blackglass Sentry: ${event.message ?? "unhandled error"}`.slice(0, 1024);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.blackglasssec.com";
  const sentryOrg = process.env.SENTRY_ORG ?? "";
  const sentryProject = process.env.SENTRY_PROJECT ?? "";
  const links: Array<{ href: string; text: string }> = [];
  if (event.event_id && sentryOrg && sentryProject) {
    links.push({
      href: `https://sentry.io/organizations/${sentryOrg}/issues/?query=event_id%3A${event.event_id}&project=${sentryProject}`,
      text: "Sentry event",
    });
  }
  links.push({ href: `${appUrl}/audit`, text: "Blackglass audit log" });

  const payload = {
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key: `blackglass-sentry-${fingerprint}`,
    payload: {
      summary,
      severity: severityFromLevel(event.level),
      source: "blackglass-server",
      component: exc?.type ?? "sentry",
      class: "unhandled_error",
      timestamp: new Date().toISOString(),
      custom_details: {
        sentry_event_id: event.event_id ?? null,
        request_url: event.request?.url ?? null,
        fingerprint,
      },
    },
    links,
  };

  try {
    const res = await fetch(PAGERDUTY_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[sentry-pagerduty] PD trigger ${res.status} ${res.statusText} for ${fingerprint}`);
    }
  } catch (err) {
    // The Sentry pipeline is more important than this bridge — log and move on.
    console.error(
      `[sentry-pagerduty] PD trigger failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Internals exposed for tests only — kept off the public API.
 */
export const __internals = {
  bridgeEnabled,
  shouldTrigger,
  fingerprintFromEvent,
  severityFromLevel,
  resetThrottle: () => lastTriggerByFingerprint.clear(),
};
