/**
 * Sandbox job queue — BullMQ job types and queue singleton for sandbox lifecycle.
 *
 * Job types:
 *   sandbox:provision  — calls provisionSandbox() then activateSandbox()
 *   sandbox:seed-drift — advances seedPhase by 1 on the sandbox VM
 *   sandbox:cleanup    — called when TTL expires; calls destroySandbox()
 */

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";

export type SandboxJobProvision = {
  type: "sandbox:provision";
  sandboxId: string;
  tenantId: string;
};

export type SandboxJobSeedDrift = {
  type: "sandbox:seed-drift";
  sandboxId: string;
  tenantId: string;
  /** Which scene to apply (1–8). */
  phase: number;
};

export type SandboxJobCleanup = {
  type: "sandbox:cleanup";
  sandboxId: string;
  tenantId: string;
};

export type SandboxJobPayload =
  | SandboxJobProvision
  | SandboxJobSeedDrift
  | SandboxJobCleanup;

// ---------------------------------------------------------------------------
// Queue singleton (enqueue-only, web tier)
// ---------------------------------------------------------------------------

const SANDBOX_QUEUE_KEY = "__blackglass_sandbox_queue_v1" as const;
type G = typeof globalThis & {
  [SANDBOX_QUEUE_KEY]?: import("bullmq").Queue<SandboxJobPayload>;
};

export async function getSandboxQueue(): Promise<
  import("bullmq").Queue<SandboxJobPayload> | null
> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[SANDBOX_QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    g[SANDBOX_QUEUE_KEY] = new Queue<SandboxJobPayload>(QUEUE_NAMES.SANDBOX, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        ...RETRY_POLICIES.sandboxProvision,
        ...RETENTION.sandbox,
      },
    });
  }
  return g[SANDBOX_QUEUE_KEY]!;
}

/**
 * Enqueue a sandbox provision job.  If no queue is configured, provision
 * is deferred — the caller should display a "provisioning" state in the UI
 * and poll GET /api/v1/sandbox until status = "ready".
 */
export async function enqueueSandboxProvision(
  sandboxId: string,
  tenantId: string,
): Promise<void> {
  const q = await getSandboxQueue();
  if (!q) {
    // Fallback: fire-and-forget in-process (dev/staging without Redis)
    const { activateSandbox } = await import("@/lib/server/services/sandbox-provisioner");
    activateSandbox(sandboxId, tenantId).catch((e) =>
      console.error("[sandbox-queue] in-process activate failed", e),
    );
    return;
  }
  await q.add(
    "sandbox:provision",
    { type: "sandbox:provision", sandboxId, tenantId },
    // BullMQ rejects jobIds containing ":" (it's its own internal namespace
    // separator).  Use "-" so deduplication still works (one provision job
    // per sandbox row) without throwing on enqueue.
    { jobId: `provision-${sandboxId}` },
  );
}

/**
 * Enqueue a drift-seed job for a given phase.
 * Scheduled 5 minutes after provision completes to allow cloud-init to finish.
 */
export async function enqueueSandboxSeedDrift(
  sandboxId: string,
  tenantId: string,
  phase: number,
  delayMs = 0,
): Promise<void> {
  const q = await getSandboxQueue();
  if (!q) return; // seeding is best-effort
  await q.add(
    "sandbox:seed-drift",
    { type: "sandbox:seed-drift", sandboxId, tenantId, phase },
    { jobId: `seed-${sandboxId}-${phase}`, delay: delayMs },
  );
}

/**
 * Enqueue a cleanup job with a delay equal to the sandbox TTL.
 */
export async function enqueueSandboxCleanup(
  sandboxId: string,
  tenantId: string,
  ttlExpiresAt: Date,
): Promise<void> {
  const q = await getSandboxQueue();
  if (!q) return;
  const delayMs = Math.max(0, ttlExpiresAt.getTime() - Date.now());
  await q.add(
    "sandbox:cleanup",
    { type: "sandbox:cleanup", sandboxId, tenantId },
    { jobId: `cleanup-${sandboxId}`, delay: delayMs },
  );
}
