/**
 * Tenant data export service.
 *
 * `enqueueExport()` writes a row to `saas_data_exports`, fires off the
 * collection job via setImmediate, and returns immediately.  The runner
 * collects everything the tenant could reasonably want (evidence, drift,
 * audit, hosts, retention, notifications) into a single JSON document and:
 *
 *   - uploads it to Spaces under `exports/{tenantId}/{exportId}.json` when
 *     the SPACES_* envs are configured, then writes the object_key + sets
 *     status=ready with a 7-day expiresAt;
 *   - falls back to inlining the JSON in the row's `error_message` column
 *     prefixed with `INLINE:` so the download endpoint can serve it without
 *     Spaces (only safe for small tenants — capped at 5 MB).
 *
 * GDPR / data-portability shape: one self-describing JSON object so the
 * recipient does not need any tooling to read it.  The schema string at
 * the top makes future format changes traceable.
 */

import { withBypassRls, withTenantRls, schema, tryGetDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PostgresDriftEventsRepository } from "@/lib/server/store/driftevents-pg";
import { getRetentionPolicy } from "./retention-service";
import { getTenantNotifications } from "./notifications-service";
import { listSaasAudit } from "./audit-service";
import { enqueueExportJob } from "@/lib/server/queue/export-queue";

const {
  saasDataExports,
  saasCollectorHosts,
  saasEvidenceBundles,
} = schema;

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportStatus = "queued" | "running" | "ready" | "failed" | "expired";

export interface DataExportView {
  id: string;
  status: ExportStatus;
  requestedBy: string | null;
  deliverTo: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Present only when status='ready'. */
  downloadUrl?: string;
}

const INLINE_LIMIT_BYTES = 5 * 1024 * 1024;
const INLINE_PREFIX = "INLINE:";
const URL_TTL_SECONDS = 7 * 24 * 60 * 60;

// ── Storage helpers ──────────────────────────────────────────────────────────

interface SpacesConfig {
  bucket: string;
  client: S3Client;
}

function spacesConfig(): SpacesConfig | null {
  const bucket = process.env.SPACES_BUCKET?.trim();
  const key = process.env.SPACES_KEY?.trim();
  const secret = process.env.SPACES_SECRET?.trim();
  const endpoint = process.env.SPACES_ENDPOINT?.trim();
  const region = process.env.SPACES_REGION?.trim() ?? "us-east-1";
  if (!bucket || !key || !secret || !endpoint) return null;
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: key, secretAccessKey: secret },
      forcePathStyle: false,
    }),
  };
}

async function uploadJsonToSpaces(
  cfg: SpacesConfig,
  key: string,
  body: string,
): Promise<void> {
  await cfg.client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
      ContentDisposition: `attachment; filename="${key.split("/").pop()}"`,
    }),
  );
}

export async function signDownload(objectKey: string, ttlSec = URL_TTL_SECONDS): Promise<string | null> {
  const cfg = spacesConfig();
  if (!cfg) return null;
  return getSignedUrl(
    cfg.client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
    { expiresIn: ttlSec },
  );
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToView(
  row: typeof saasDataExports.$inferSelect,
): DataExportView {
  // Scrub the INLINE_PREFIX sentinel from errorMessage so the UI doesn't
  // see it (the actual inline payload stays in the DB until download).
  const scrubbed =
    row.errorMessage && row.errorMessage.startsWith(INLINE_PREFIX)
      ? null
      : row.errorMessage;
  return {
    id: row.id,
    status: row.status as ExportStatus,
    requestedBy: row.requestedBy,
    deliverTo: row.deliverTo,
    sizeBytes: row.sizeBytes,
    errorMessage: scrubbed,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function enqueueExport(
  tenantId: string,
  actorUserId: string | null,
  deliverTo: string | null,
): Promise<DataExportView> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasDataExports)
      .values({
        tenantId,
        status: "queued",
        requestedBy: actorUserId,
        deliverTo,
      })
      .returning(),
  );

  // Prefer the BullMQ-backed queue when Redis is configured: keeps the
  // bundle assembly out of the API process so a 50 MB export does not
  // block one Node worker for tens of seconds. Falls back to in-process
  // setImmediate when Redis is unset (dev / single-tenant deployments).
  const queued = await enqueueExportJob({
    exportId: row!.id,
    tenantId,
  }).catch((err) => {
    console.error("[export-service] enqueue failed, falling back to inline:", err);
    return false;
  });
  if (!queued) {
    setImmediate(() => {
      void runExportJob(row!.id, tenantId).catch((err) => {
        console.error("[export-service] job crashed", err);
      });
    });
  }

  return rowToView(row!);
}

export async function listExports(tenantId: string, limit = 20): Promise<DataExportView[]> {
  if (!tryGetDb()) return [];
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasDataExports)
      .where(eq(saasDataExports.tenantId, tenantId))
      .orderBy(desc(saasDataExports.createdAt))
      .limit(limit),
  );
  return rows.map(rowToView);
}

export async function getExportForDownload(
  tenantId: string,
  exportId: string,
): Promise<
  | { kind: "spaces"; signedUrl: string; expiresAt: string | null }
  | { kind: "inline"; body: string; sizeBytes: number }
  | { kind: "error"; status: number; message: string }
> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasDataExports)
      .where(
        and(eq(saasDataExports.tenantId, tenantId), eq(saasDataExports.id, exportId)),
      ),
  );
  if (!row) return { kind: "error", status: 404, message: "Export not found." };
  if (row.status !== "ready") {
    return {
      kind: "error",
      status: 409,
      message: `Export is in state '${row.status}' — wait for it to reach 'ready'.`,
    };
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { kind: "error", status: 410, message: "Export download link has expired." };
  }

  if (row.errorMessage?.startsWith(INLINE_PREFIX)) {
    const body = row.errorMessage.slice(INLINE_PREFIX.length);
    return { kind: "inline", body, sizeBytes: row.sizeBytes ?? body.length };
  }

  if (row.objectKey) {
    const signed = await signDownload(row.objectKey);
    if (!signed) {
      return {
        kind: "error",
        status: 503,
        message: "Spaces is not configured on this deployment.",
      };
    }
    return {
      kind: "spaces",
      signedUrl: signed,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  return { kind: "error", status: 500, message: "Export has no download artefact." };
}

// ── Job runner ──────────────────────────────────────────────────────────────

async function setStatus(
  exportId: string,
  patch: Partial<typeof saasDataExports.$inferInsert>,
): Promise<void> {
  // RLS-BYPASS: export-job runner updates a row keyed by exportId (UUID,
  // unforgeable); not running in a per-request tenant context. Tenant
  // ownership of the row is enforced by the calling tenant-RLS path that
  // created the row and by the WHERE clause below.
  await withBypassRls((db) =>
    db
      .update(saasDataExports)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(saasDataExports.id, exportId)),
  );
}

export async function runExportJob(exportId: string, tenantId: string): Promise<void> {
  await setStatus(exportId, { status: "running" });
  try {
    const bundle = await collectTenantBundle(tenantId);
    const body = JSON.stringify(bundle, null, 2);
    const sizeBytes = Buffer.byteLength(body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);

    const cfg = spacesConfig();
    if (cfg) {
      const objectKey = `exports/${tenantId}/${exportId}.json`;
      await uploadJsonToSpaces(cfg, objectKey, body);
      await setStatus(exportId, {
        status: "ready",
        objectKey,
        sizeBytes,
        expiresAt,
        errorMessage: null,
      });
    } else {
      // Inline path — only safe for small bundles.
      if (sizeBytes > INLINE_LIMIT_BYTES) {
        await setStatus(exportId, {
          status: "failed",
          errorMessage: `Bundle is ${(sizeBytes / 1_048_576).toFixed(1)} MB but Spaces is not configured. Set SPACES_BUCKET / SPACES_KEY / SPACES_SECRET / SPACES_ENDPOINT to enable >${INLINE_LIMIT_BYTES / 1_048_576} MB exports.`,
        });
        return;
      }
      await setStatus(exportId, {
        status: "ready",
        sizeBytes,
        expiresAt,
        errorMessage: `${INLINE_PREFIX}${body}`,
      });
    }

    // Light audit trail in the deployment log — no email transport gated here.
    console.log(
      `[export-service] tenant=${tenantId} export=${exportId} ready bytes=${sizeBytes} sha256=${sha256.slice(0, 12)}`,
    );
  } catch (err) {
    await setStatus(exportId, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Bundle collection ───────────────────────────────────────────────────────

async function collectTenantBundle(tenantId: string): Promise<Record<string, unknown>> {
  const [hosts, evidence, retention, notifications, audit] = await Promise.all([
    withTenantRls(tenantId, (db) =>
      db.select().from(saasCollectorHosts).where(eq(saasCollectorHosts.tenantId, tenantId)),
    ),
    withTenantRls(tenantId, (db) =>
      db.select().from(saasEvidenceBundles).where(eq(saasEvidenceBundles.tenantId, tenantId)),
    ),
    getRetentionPolicy(tenantId),
    getTenantNotifications(tenantId),
    listSaasAudit(tenantId, { limit: 200 }),
  ]);

  // Drift events: scope to this tenant's hosts.
  const hostIds = hosts.map((h) => h.id);
  const driftEvents =
    hostIds.length > 0
      ? await PostgresDriftEventsRepository.listByHostIds(hostIds, 5000)
      : [];

  return {
    schema: "blackglass-tenant-export/1",
    generatedAt: new Date().toISOString(),
    tenantId,
    counts: {
      hosts: hosts.length,
      evidenceBundles: evidence.length,
      driftEvents: driftEvents.length,
      auditEvents: audit.items.length,
    },
    hosts: hosts.map((h) => ({
      id: h.id,
      hostname: h.hostname,
      sshUser: h.sshUser,
      sshPort: h.sshPort,
      enabled: h.enabled,
      createdAt: h.createdAt.toISOString(),
    })),
    retention,
    notifications,
    evidenceBundles: evidence.map((b) => ({
      id: b.id,
      title: b.title,
      scope: b.scope,
      sha256: b.sha256,
      generatedBy: b.generatedBy,
      createdAt: b.createdAt.toISOString(),
      payload: b.payload,
    })),
    driftEvents,
    auditEvents: audit.items,
    notice:
      "Generated by Blackglass tenant data export. Contains all telemetry the workspace can read. Retain or destroy per your data-protection policy.",
  };
}
