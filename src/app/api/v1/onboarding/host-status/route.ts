/**
 * GET /api/v1/onboarding/host-status?hostId=<id>
 *
 * Per-host onboarding state machine. The wizard polls this endpoint
 * during step 1 to drive specific UI for each stage instead of inferring
 * "is the host online?" from a fleet-wide signal.
 *
 * Stages
 * ------
 *   awaiting_first_push   no baseline AND no cached agent snapshot yet
 *   bundle_received       cached agent snapshot exists but no baseline
 *                         (transient — the route writes baseline + cache
 *                         in the same handler, so this stage is mostly
 *                         theoretical and exists for safety)
 *   bundle_invalid        cached snapshot is missing critical sections
 *                         (e.g., listeners empty, users empty) — the
 *                         agent ran but couldn't read system state
 *   baseline_captured     baseline pinned, host is healthy
 *   blocked_tombstone     host is currently tombstoned (recently deleted)
 *   blocked_quota         tenant host allowance reached
 *
 * The endpoint is intentionally lightweight: no DB writes, no scans
 * triggered. Safe to poll at 3-5s cadence.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { hasBaseline, getBaseline } from "@/lib/server/baseline-store";
import { getRecentAgentSnapshot } from "@/lib/server/agent-snapshot-cache";
import { isHostTombstoned } from "@/lib/server/host-tombstones";
import { withinHostAllowance } from "@/lib/saas/operations";
import { getSubscriptionForTenant } from "@/lib/saas/tenant-service";
import { listBaselineHostIds } from "@/lib/server/baseline-store";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { requireRole } from "@/lib/server/http/auth-guard";
import {
  logOnboardingEvent,
  recordStageObservation,
} from "@/lib/server/onboarding/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  hostId: ResourceIdPathSchema,
  startedAt: z.coerce.number().int().min(0).optional(),
});

/**
 * Sections the agent must produce non-empty data for to be considered
 * a "valid" first push. We don't require ALL of them — some hosts have
 * no UFW, no SUID changes, no third-party packages — but the listeners
 * + users + ssh trio is the floor: if those are empty, the bundle was
 * truncated or sudo failed.
 */
const REQUIRED_NON_EMPTY = ["listeners", "users", "ssh"] as const;

type OnboardingStage =
  | { stage: "awaiting_first_push"; elapsedSeconds: number }
  | {
      stage: "bundle_received";
      summary: BundleSummary;
    }
  | {
      stage: "bundle_invalid";
      reason: string;
      missing: string[];
      summary: BundleSummary;
    }
  | {
      stage: "baseline_captured";
      capturedAt: string;
      hostId: string;
      summary: BundleSummary;
    }
  | { stage: "blocked_tombstone"; expiresAt: string; remedy: string }
  | {
      stage: "blocked_quota";
      current: number;
      limit: number;
      remedy: string;
    };

type BundleSummary = {
  sections: number;
  listeners: number;
  users: number;
  services: number;
};

function summarise(snapshot: {
  listeners: unknown[];
  users: unknown[];
  services: unknown[];
}): BundleSummary {
  // "Sections" is a count of how many top-level data buckets came back
  // non-empty. Mirrors the 17-section bundle the agent produces.
  let sections = 0;
  for (const k of [
    "listeners",
    "users",
    "sudoers",
    "sudoersFiles",
    "cronEntries",
    "userCrontabs",
    "services",
    "ssh",
    "firewall",
    "authorizedKeys",
    "fileHashes",
    "hostsEntries",
    "kernelModules",
    "suidBinaries",
    "installedPackages",
    "systemdUnitFiles",
  ]) {
    const v = (snapshot as Record<string, unknown>)[k];
    if (Array.isArray(v) ? v.length > 0 : v && typeof v === "object") sections += 1;
  }
  return {
    sections,
    listeners: snapshot.listeners.length,
    users: snapshot.users.length,
    services: snapshot.services.length,
  };
}

function findMissingSections(snapshot: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const k of REQUIRED_NON_EMPTY) {
    const v = snapshot[k];
    if (Array.isArray(v)) {
      if (v.length === 0) missing.push(k);
    } else if (!v || typeof v !== "object") {
      missing.push(k);
    } else if (k === "ssh" && Object.keys(v).length === 0) {
      missing.push(k);
    }
  }
  return missing;
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // Auth: the wizard runs inside the authenticated app shell, so we can
  // use the same permission as host viewing. The endpoint is read-only.
  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    hostId: url.searchParams.get("hostId"),
    startedAt: url.searchParams.get("startedAt") ?? undefined,
  });
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);
  const { hostId, startedAt } = parsed.data;

  const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim() || null;

  // Emit a single log line per (host, stage) transition. The wizard polls
  // this endpoint every few seconds; without this gate we would write a
  // log line per poll which is useless noise. With it, the log timeline
  // for any onboarding session reads as a clean state-machine trace.
  const respond = (result: OnboardingStage) => {
    if (recordStageObservation(ingestTenantId, hostId, result.stage)) {
      logOnboardingEvent("onboarding.stage_observed", {
        tenantId: ingestTenantId,
        hostId,
        requestId,
        stage: result.stage,
        outcome: result.stage.startsWith("blocked_")
          ? "blocked"
          : result.stage === "baseline_captured"
            ? "ok"
            : result.stage === "bundle_invalid"
              ? "fail"
              : "skipped",
      });
    }
    return jsonWithRequestId(result, requestId);
  };

  // 1. Tombstone — highest precedence; we don't even peek at the
  //    baseline because the user has explicitly said "this host is gone".
  try {
    const tombstone = await isHostTombstoned(hostId, ingestTenantId);
    if (tombstone) {
      const result: OnboardingStage = {
        stage: "blocked_tombstone",
        expiresAt: tombstone.expiresAt,
        remedy:
          "This host was recently deleted. Click 'Reset and reinstall' to clear the tombstone and start fresh, or wait until it expires.",
      };
      return respond(result);
    }
  } catch (err) {
    console.error("[onboarding/host-status] tombstone lookup failed:", err);
    // Fail-open: if the tombstone store is down, fall through to other
    // checks — the ingest path itself will still enforce.
  }

  // 2. Quota — surface as a blocking stage so the wizard tells the user
  //    they need to upgrade or delete a host BEFORE they wait a minute
  //    for a push that the agent route will then 403 anyway.
  if (ingestTenantId) {
    try {
      const sub = await getSubscriptionForTenant(ingestTenantId);
      if (sub) {
        const ids = await listBaselineHostIds();
        const known = new Set(ids);
        const isNewHost = !known.has(hostId);
        const gate = withinHostAllowance(sub, known.size, isNewHost ? 1 : 0);
        if (!gate.ok) {
          const result: OnboardingStage = {
            stage: "blocked_quota",
            current: known.size,
            limit: sub.hostLimit,
            remedy:
              "Your workspace has reached its host allowance. Delete an unused host from /hosts, or upgrade your plan from /settings/billing.",
          };
          return respond(result);
        }
      }
    } catch (err) {
      console.error("[onboarding/host-status] quota lookup failed:", err);
    }
  }

  // 3. Baseline already captured — the happy path.
  const haveBaseline = await hasBaseline(hostId);
  if (haveBaseline) {
    const baseline = await getBaseline(hostId);
    if (baseline) {
      const result: OnboardingStage = {
        stage: "baseline_captured",
        capturedAt: baseline.collectedAt,
        hostId,
        summary: summarise(baseline),
      };
      return respond(result);
    }
  }

  // 4. We have a recent agent snapshot but no baseline yet — could be
  //    a transient race (we're between the cache write and the baseline
  //    write within the ingest handler), or it could be that the bundle
  //    was malformed and we've held it without committing as baseline.
  //
  //    We don't have a "transient race" in practice (the ingest handler
  //    writes baseline THEN cache), but be defensive.
  //
  //    More usefully: even though baseline-and-cache are written in the
  //    same handler, we use the cache snapshot for richer per-stage
  //    summary data (the cache is updated on every push, baseline only
  //    on bootstrap, so the cache is more current).
  const cached = getRecentAgentSnapshot(
    hostId,
    Number(process.env.COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS ?? 900),
  );
  if (cached) {
    const summary = summarise(cached);
    const missing = findMissingSections(cached as unknown as Record<string, unknown>);
    if (missing.length > 0) {
      const result: OnboardingStage = {
        stage: "bundle_invalid",
        reason:
          "Agent collected a bundle but key sections are empty. Most often this is sudo not granting access to /etc/sudoers.d or sshd_config — re-run the install script.",
        missing,
        summary,
      };
      return respond(result);
    }
    const result: OnboardingStage = { stage: "bundle_received", summary };
    return respond(result);
  }

  // 5. Default: still waiting for the first push.
  const elapsedSeconds = startedAt
    ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    : 0;
  const result: OnboardingStage = {
    stage: "awaiting_first_push",
    elapsedSeconds,
  };
  return respond(result);
}

// Export the type so the wizard and tests share one source of truth.
export type { OnboardingStage, BundleSummary };
