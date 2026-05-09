/**
 * Structured onboarding telemetry.
 *
 * Goal: answer "where do customers drop off in the first-baseline flow?"
 * from logs, without inventing a new metrics pipeline. Every event uses a
 * stable `event` field so DO/Sentry log search just works:
 *
 *   level=info event=onboarding.* tenant=... host=...
 *
 * Stage observations from the wizard's polling loop deduplicate per (host,
 * stage) within the process to avoid log spam — only true transitions emit
 * a line. One-shot operations (ssh-test, reset, ingest) always log.
 */
import { logStructured } from "@/lib/server/log";

export type OnboardingEvent =
  // host-status state machine
  | "onboarding.stage_observed"
  // ssh-pull wizard
  | "onboarding.ssh_keypair_generated"
  | "onboarding.ssh_test_attempted"
  // host lifecycle
  | "onboarding.host_reset"
  | "onboarding.recent_bootstraps_queried"
  // ingest pipeline (push agent)
  | "onboarding.ingest_blocked"
  | "onboarding.ingest_validation_failed"
  | "onboarding.ingest_baseline_bootstrapped"
  | "onboarding.ingest_drift_pipeline_failed"
  | "onboarding.ingest_succeeded";

export type OnboardingFields = {
  tenantId?: string | null;
  hostId?: string | null;
  requestId?: string | null;
  stage?: string;
  outcome?: "ok" | "fail" | "blocked" | "skipped";
  reason?: string;
  durationMs?: number;
  /** Free-form metadata — keep it small and PII-free. */
  meta?: Record<string, string | number | boolean | null>;
};

export function logOnboardingEvent(
  event: OnboardingEvent,
  fields: OnboardingFields = {},
): void {
  const level: "info" | "warn" =
    fields.outcome === "fail" || fields.outcome === "blocked" ? "warn" : "info";
  logStructured(level, event, {
    event,
    tenant: fields.tenantId ?? null,
    host: fields.hostId ?? null,
    request_id: fields.requestId ?? null,
    stage: fields.stage ?? null,
    outcome: fields.outcome ?? null,
    reason: fields.reason ?? null,
    duration_ms: fields.durationMs ?? null,
    ...(fields.meta ?? {}),
  });
}

/**
 * Per-process LRU of last-seen onboarding stage per (tenant, host) pair.
 * Used to gate `stage_observed` logs from the host-status polling loop so
 * we only emit a line when the stage actually changes.
 *
 * Bounded at 1024 entries — far above the realistic concurrent onboarding
 * count for a single console process. When the bound is hit we evict the
 * oldest entry (Map preserves insertion order).
 */
const STAGE_CACHE_LIMIT = 1024;
const lastStage = new Map<string, string>();

function key(tenantId: string | null | undefined, hostId: string): string {
  return `${tenantId ?? "_"}:${hostId}`;
}

/**
 * Record a stage observation and return whether it represents a transition.
 * Callers should only emit a `stage_observed` log line when this returns true.
 */
export function recordStageObservation(
  tenantId: string | null | undefined,
  hostId: string,
  stage: string,
): boolean {
  const k = key(tenantId, hostId);
  const previous = lastStage.get(k);
  if (previous === stage) return false;

  if (lastStage.size >= STAGE_CACHE_LIMIT) {
    const oldest = lastStage.keys().next().value;
    if (oldest !== undefined) lastStage.delete(oldest);
  }
  lastStage.set(k, stage);
  return true;
}

/** Test-only reset. Not exported from a public barrel. */
export function __resetOnboardingTelemetryForTests(): void {
  lastStage.clear();
}
