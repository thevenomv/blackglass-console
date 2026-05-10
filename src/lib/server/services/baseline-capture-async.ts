import { and, eq, lt, sql } from "drizzle-orm";
import { tryGetDb, withBypassRls, withTenantRls, schema } from "@/db";
import {
  captureBaselinesFromFleet,
  type BaselineCaptureOutcome,
} from "@/lib/server/services/baseline-capture";
import { emitSaasAudit } from "@/lib/saas/event-log";

export type BaselineJobStatus = "queued" | "running" | "succeeded" | "failed";

export type BaselineJobPublic = {
  id: string;
  status: BaselineJobStatus;
  captured?: Array<Record<string, unknown>>;
  failed?: Array<{ hostId: string; detail: string }>;
  error_detail?: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export function baselineAsyncJobsEnabled(): boolean {
  return tryGetDb() !== null;
}

export async function createQueuedBaselineJob(params: {
  tenantId: string | null;
  requestId: string;
}): Promise<string> {
  const values = {
    tenantId: params.tenantId,
    status: "queued" as const,
    requestId: params.requestId,
  };
  if (params.tenantId) {
    return withTenantRls(params.tenantId, async (tx) => {
      const [row] = await tx.insert(schema.saasBaselineCaptureJobs).values(values).returning({
        id: schema.saasBaselineCaptureJobs.id,
      });
      return row.id;
    });
  }
  // RLS-BYPASS: legacy / single-tenant deployments without a workspace
  // tenantId — job row is created without a tenant FK and its lifecycle
  // is read-only by the caller via getBaselineJobRowBypass below.
  return withBypassRls(async (tx) => {
    const [row] = await tx.insert(schema.saasBaselineCaptureJobs).values(values).returning({
      id: schema.saasBaselineCaptureJobs.id,
    });
    return row.id;
  });
}

export async function getBaselineJobRowBypass(jobId: string) {
  // RLS-BYPASS: status-poll endpoint for an async job; lookup is by job id
  // (UUID). Polling continues across pages / workers without a stable
  // tenant context, and the result shape contains no cross-tenant data.
  return withBypassRls(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.saasBaselineCaptureJobs)
      .where(eq(schema.saasBaselineCaptureJobs.id, jobId))
      .limit(1);
    return rows[0] ?? null;
  });
}

function rowToPublic(row: typeof schema.saasBaselineCaptureJobs.$inferSelect): BaselineJobPublic {
  const result = row.result as { captured?: unknown[]; failed?: unknown[] } | null;
  const captured = Array.isArray(result?.captured)
    ? (result!.captured as Array<Record<string, unknown>>)
    : undefined;
  const failed = Array.isArray(result?.failed)
    ? (result!.failed as Array<{ hostId: string; detail: string }>)
    : undefined;
  return {
    id: row.id,
    status: row.status as BaselineJobStatus,
    ...(captured?.length ? { captured } : {}),
    ...(failed?.length ? { failed } : {}),
    ...(row.errorDetail ? { error_detail: row.errorDetail } : {}),
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

export async function getBaselineJobPublicBypass(jobId: string): Promise<BaselineJobPublic | null> {
  const row = await getBaselineJobRowBypass(jobId);
  return row ? rowToPublic(row) : null;
}

async function updateJobBypass(
  jobId: string,
  patch: Partial<{
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    result: Record<string, unknown> | null;
    errorDetail: string | null;
  }>,
) {
  // RLS-BYPASS: in-process after() task lifecycle write. Runs after the
  // request scope ends; updates the job row by job id only.
  await withBypassRls(async (tx) => {
    await tx
      .update(schema.saasBaselineCaptureJobs)
      .set(patch)
      .where(eq(schema.saasBaselineCaptureJobs.id, jobId));
  });
}

function outcomeToStoredResult(outcome: BaselineCaptureOutcome): Record<string, unknown> | null {
  if (outcome.kind !== "ok") return null;
  return {
    captured: outcome.payload.captured,
    ...(outcome.payload.failed?.length ? { failed: outcome.payload.failed } : {}),
  };
}

/**
 * Runs inside `after()` — must not rely on request scope. Uses bypass RLS for
 * job row updates (trusted server path only).
 */
export async function executeBaselineCaptureJob(jobId: string, ctx: {
  workspaceTenantId: string | null;
  auditorUserId: string | null;
  requestId: string;
}): Promise<void> {
  try {
    await updateJobBypass(jobId, { status: "running", startedAt: new Date() });
    const outcome = await captureBaselinesFromFleet({
      tenantId: ctx.workspaceTenantId ?? undefined,
    });

    if (outcome.kind === "ok") {
      await updateJobBypass(jobId, {
        status: "succeeded",
        finishedAt: new Date(),
        result: outcomeToStoredResult(outcome),
        errorDetail: null,
      });
      if (ctx.workspaceTenantId && ctx.auditorUserId) {
        void emitSaasAudit({
          tenantId: ctx.workspaceTenantId,
          actorUserId: ctx.auditorUserId,
          action: "baseline.captured",
          metadata: { count: outcome.payload.captured.length, request_id: ctx.requestId, job_id: jobId },
        });
      }
      return;
    }

    const detail =
      outcome.kind === "collection_failed"
        ? outcome.detail
        : outcome.kind === "exception"
          ? outcome.message
          : "Unknown error";

    await updateJobBypass(jobId, {
      status: "failed",
      finishedAt: new Date(),
      result: null,
      errorDetail: detail.slice(0, 4000),
    });

    if (ctx.workspaceTenantId && ctx.auditorUserId) {
      void emitSaasAudit({
        tenantId: ctx.workspaceTenantId,
        actorUserId: ctx.auditorUserId,
        action: "baseline.capture_failed",
        metadata: { detail, request_id: ctx.requestId, job_id: jobId },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[baseline-job] execute failed:", err);
    await updateJobBypass(jobId, {
      status: "failed",
      finishedAt: new Date(),
      result: null,
      errorDetail: msg.slice(0, 4000),
    });
  }
}

const STALE_QUEUED_MS = 45 * 60 * 1000;
const STALE_RUNNING_MS = 6 * 60 * 60 * 1000;

/**
 * Marks stuck async baseline jobs as failed so clients do not poll forever.
 * Runs from the ops-worker retention sweep (requires DATABASE_URL + worker).
 */
export async function expireStaleBaselineCaptureJobs(): Promise<{ markedFailed: number }> {
  if (!tryGetDb()) return { markedFailed: 0 };
  const now = Date.now();
  const queuedBefore = new Date(now - STALE_QUEUED_MS);
  const runningBefore = new Date(now - STALE_RUNNING_MS);
  const msgQueued =
    "Job did not start within the expected window (the server may have restarted or the background task did not run). Retry baseline capture from Baselines.";
  const msgRunning =
    "Baseline capture exceeded the maximum background runtime and was stopped. Retry with fewer hosts or check collector SSH connectivity.";

  // RLS-BYPASS: ops-worker retention sweep marks orphan jobs across all
  // tenants as failed. Cross-tenant by design (one query per status).
  return withBypassRls(async (tx) => {
    const finishedAt = new Date();
    const expiredQueued = await tx
      .update(schema.saasBaselineCaptureJobs)
      .set({
        status: "failed",
        finishedAt,
        errorDetail: msgQueued,
        result: null,
      })
      .where(
        and(
          eq(schema.saasBaselineCaptureJobs.status, "queued"),
          lt(schema.saasBaselineCaptureJobs.createdAt, queuedBefore),
        ),
      )
      .returning({ id: schema.saasBaselineCaptureJobs.id });

    const expiredRunning = await tx
      .update(schema.saasBaselineCaptureJobs)
      .set({
        status: "failed",
        finishedAt,
        errorDetail: msgRunning,
        result: null,
      })
      .where(
        and(
          eq(schema.saasBaselineCaptureJobs.status, "running"),
          lt(
            sql`COALESCE(${schema.saasBaselineCaptureJobs.startedAt}, ${schema.saasBaselineCaptureJobs.createdAt})`,
            runningBefore,
          ),
        ),
      )
      .returning({ id: schema.saasBaselineCaptureJobs.id });

    return { markedFailed: expiredQueued.length + expiredRunning.length };
  });
}

/** Dev/tests: synchronous capture when DATABASE_URL is unset. */
export async function captureBaselinesSyncLegacy(
  tenantId?: string,
): Promise<BaselineCaptureOutcome> {
  const ROUTE_TIMEOUT_MS = 30_000;
  const outcomeRaw = await Promise.race([
    captureBaselinesFromFleet({ tenantId }),
    new Promise<{ kind: "timeout" }>((resolve) =>
      setTimeout(() => resolve({ kind: "timeout" }), ROUTE_TIMEOUT_MS),
    ),
  ]);
  if (outcomeRaw.kind === "timeout") {
    return { kind: "collection_failed", detail: "capture_timeout" };
  }
  return outcomeRaw;
}
