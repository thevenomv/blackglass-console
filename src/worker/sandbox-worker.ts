/**
 * BLACKGLASS sandbox worker — BullMQ consumer for sandbox lifecycle jobs.
 *
 * Handles:
 *   sandbox:provision  — calls activateSandbox(), then schedules seed-drift + cleanup
 *   sandbox:seed-drift — SSHes into the Droplet and runs /root/sandbox/seed.sh <phase>
 *   sandbox:cleanup    — calls destroySandbox()
 *
 * Run alongside the scan worker:
 *   node --import tsx/esm src/worker/sandbox-worker.ts
 *
 * Environment variables:
 *   REDIS_QUEUE_URL    — BullMQ Redis connection
 *   DO_API_TOKEN       — DigitalOcean API token (Droplet read/write/delete)
 *   DATABASE_URL       — Postgres for sandbox/credential lookups
 *   KMS_PROVIDER / KMS_LOCAL_SECRET — envelope decryption for sandbox private key
 *   SANDBOX_TTL_HOURS  — sandbox lifetime (default 4)
 */

import { Worker } from "bullmq";
import { QUEUE_NAMES } from "@/lib/server/queue/scan-queue";
import {
  activateSandbox,
  destroySandbox,
  provisionSandbox,
} from "@/lib/server/services/sandbox-provisioner";
import {
  enqueueSandboxSeedDrift,
  enqueueSandboxCleanup,
  enqueueSandboxProvision,
  type SandboxJobPayload,
} from "@/lib/server/queue/sandbox-queue";
import { withBypassRls, schema } from "@/db";
import { eq } from "drizzle-orm";
import { maybeDecryptPem } from "@/lib/server/secrets/envelope";

const { saasSandboxes, tenantCredentials } = schema;

const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
if (!redisUrl) {
  console.error("[sandbox-worker] REDIS_QUEUE_URL is not set — worker cannot start");
  process.exit(1);
}

console.info(`[sandbox-worker] Starting — queue=${QUEUE_NAMES.SANDBOX}`);

// ---------------------------------------------------------------------------
// SSH helper — run a command on the sandbox Droplet
// ---------------------------------------------------------------------------

async function runOverSsh(ip: string, privateKeyPem: string | Buffer, command: string): Promise<void> {
  const { Client } = await import("ssh2");
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.destroy();
      reject(new Error(`SSH command timed out after 60s: ${command.slice(0, 80)}`));
    }, 60_000);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            return reject(err);
          }
          const chunks: Buffer[] = [];
          stream
            .on("close", (code: number) => {
              clearTimeout(timeout);
              conn.end();
              const output = Buffer.concat(chunks).toString("utf8");
              if (code !== 0) {
                reject(new Error(`SSH command exited ${code}: ${output.slice(0, 400)}`));
              } else {
                resolve();
              }
            })
            .on("data", (d: Buffer) => chunks.push(d))
            .stderr.on("data", (d: Buffer) => chunks.push(d));
        });
      })
      .on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      })
      .connect({
        host: ip,
        port: 22,
        username: "blackglass",
        privateKey: privateKeyPem,
        readyTimeout: 30_000,
        timeout: 10_000,
      });
  });
}

async function getSandboxPrivateKey(credentialId: string): Promise<Buffer> {
  const [cred] = await withBypassRls((db) =>
    db
      .select()
      .from(tenantCredentials)
      .where(eq(tenantCredentials.id, credentialId)),
  );
  if (!cred) throw new Error(`Credential ${credentialId} not found`);
  return maybeDecryptPem(cred.encryptedKey);
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function handleProvision(sandboxId: string, tenantId: string): Promise<void> {
  // Idempotency guard: skip if the Droplet was already activated (BullMQ retry case)
  const [existing] = await withBypassRls((db) =>
    db.select().from(saasSandboxes).where(eq(saasSandboxes.id, sandboxId)),
  );
  if (!existing) {
    console.info(`[sandbox-worker] Sandbox ${sandboxId} not found — skipping provision`);
    return;
  }
  if (existing.dropletIp && existing.status !== "error") {
    console.info(`[sandbox-worker] Sandbox ${sandboxId} already activated — skipping provision`);
    return;
  }

  console.info(`[sandbox-worker] Activating sandbox ${sandboxId}`);
  const { ip, hostId } = await activateSandbox(sandboxId, tenantId);
  console.info(`[sandbox-worker] Sandbox ${sandboxId} active — ip=${ip} hostId=${hostId}`);

  // Schedule: clean baseline (phase 0) after 3 min for cloud-init to finish
  await enqueueSandboxSeedDrift(sandboxId, tenantId, 0, 3 * 60_000);
  // Scene 1 after 8 min
  await enqueueSandboxSeedDrift(sandboxId, tenantId, 1, 8 * 60_000);
  // Scenes 2–8 every 10 min (phase N at T + (8 + N*10) min)
  for (let phase = 2; phase <= 8; phase++) {
    await enqueueSandboxSeedDrift(sandboxId, tenantId, phase, (8 + phase * 10) * 60_000);
  }

  // Cleanup when TTL expires
  const [sandbox] = await withBypassRls((db) =>
    db.select().from(saasSandboxes).where(eq(saasSandboxes.id, sandboxId)),
  );
  if (sandbox?.ttlExpiresAt) {
    await enqueueSandboxCleanup(sandboxId, tenantId, sandbox.ttlExpiresAt);
  }
}

async function handleSeedDrift(
  sandboxId: string,
  tenantId: string,
  phase: number,
): Promise<void> {
  const [sandbox] = await withBypassRls((db) =>
    db.select().from(saasSandboxes).where(eq(saasSandboxes.id, sandboxId)),
  );
  if (!sandbox || sandbox.status === "destroyed" || sandbox.status === "destroying") {
    console.info(`[sandbox-worker] Skipping seed phase=${phase} — sandbox gone`);
    return;
  }
  if (!sandbox.dropletIp || !sandbox.credentialId) {
    throw new Error(`Sandbox ${sandboxId} missing ip or credentialId`);
  }

  // Mark as seeding
  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({ status: "seeding", updatedAt: new Date() })
      .where(eq(saasSandboxes.id, sandboxId)),
  );

  // Validate phase to prevent command injection from a tampered job payload
  const safePha = Math.min(8, Math.max(0, Math.trunc(Number(phase))));
  if (!Number.isFinite(safePha)) throw new Error(`Invalid seed phase: ${phase}`);

  try {
    const privateKey = await getSandboxPrivateKey(sandbox.credentialId);
    await runOverSsh(
      sandbox.dropletIp,
      privateKey,
      `sudo bash /root/sandbox/seed.sh ${safePha}`,
    );
    await withBypassRls((db) =>
      db
        .update(saasSandboxes)
        .set({
          status: "ready",
          seedPhase: safePha,
          driftSeededAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(saasSandboxes.id, sandboxId)),
    );
    console.info(`[sandbox-worker] Drift phase=${phase} applied to sandbox ${sandboxId}`);
  } catch (err) {
    await withBypassRls((db) =>
      db
        .update(saasSandboxes)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(saasSandboxes.id, sandboxId)),
    );
    throw err;
  }
}

async function handleCleanup(sandboxId: string, tenantId: string): Promise<void> {
  console.info(`[sandbox-worker] Destroying sandbox ${sandboxId}`);
  await destroySandbox(sandboxId);
  console.info(`[sandbox-worker] Sandbox ${sandboxId} destroyed`);

  // Auto-reprovision the shared showcase sandbox so the public demo stays live.
  const showcaseTenantId = process.env.SANDBOX_SHOWCASE_TENANT_ID?.trim();
  if (showcaseTenantId && tenantId === showcaseTenantId) {
    console.info(`[sandbox-worker] Reprovisioning showcase sandbox for tenant ${tenantId}`);
    try {
      const newSandboxId = await provisionSandbox(tenantId);
      await enqueueSandboxProvision(newSandboxId, tenantId);
      console.info(`[sandbox-worker] Showcase sandbox ${newSandboxId} queued for provisioning`);
    } catch (err) {
      console.error(`[sandbox-worker] Failed to reprovision showcase sandbox: ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker<SandboxJobPayload>(
  QUEUE_NAMES.SANDBOX,
  async (job) => {
    const { type } = job.data;
    switch (type) {
      case "sandbox:provision":
        await handleProvision(job.data.sandboxId, job.data.tenantId);
        break;
      case "sandbox:seed-drift":
        await handleSeedDrift(job.data.sandboxId, job.data.tenantId, job.data.phase);
        break;
      case "sandbox:cleanup":
        await handleCleanup(job.data.sandboxId, job.data.tenantId);
        break;
      default: {
        const _exhaustive: never = job.data;
        throw new Error(`Unknown sandbox job type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  },
  {
    connection: { url: redisUrl },
    concurrency: 2,
  },
);

worker.on("completed", (job) =>
  console.info(`[sandbox-worker] Job ${job.id} (${job.data.type}) completed`),
);
worker.on("failed", (job, err) =>
  console.error(`[sandbox-worker] Job ${job?.id} (${job?.data?.type}) failed`, err),
);

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
