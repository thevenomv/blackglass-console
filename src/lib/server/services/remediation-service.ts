/**
 * Remediation recommendations — persistence + state transitions.
 *
 * The blackglass-remediator service POSTs new recommendations to
 * /api/remediations/callback; operators approve / reject from the drift
 * detail panel; this service is the single place that touches the DB row.
 */

import { withBypassRls, withTenantRls, schema, tryGetDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";

const { saasRemediations } = schema;

export type RemediationStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "expired";

export interface RemediationInput {
  tenantId: string;
  remediationId: string;
  driftEventId?: string;
  hostId?: string;
  scanId?: string;
  status: RemediationStatus;
  riskPolicyTier: string;
  summary: string;
  plan: Record<string, unknown>;
}

export interface RemediationView {
  id: string;
  remediationId: string;
  status: RemediationStatus;
  riskPolicyTier: string;
  summary: string;
  plan: Record<string, unknown>;
  driftEventId: string | null;
  hostId: string | null;
  scanId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToView(row: typeof saasRemediations.$inferSelect): RemediationView {
  return {
    id: row.id,
    remediationId: row.remediationId,
    status: row.status as RemediationStatus,
    riskPolicyTier: row.riskPolicyTier,
    summary: row.summary,
    plan: row.plan,
    driftEventId: row.driftEventId,
    hostId: row.hostId,
    scanId: row.scanId,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Insert a new remediation row (or update if the remediator re-sends the
 * same `remediationId` — happens during retries from the remediator side).
 *
 * Called from the unauthenticated callback endpoint, so uses bypass-RLS.
 */
export async function upsertRemediation(input: RemediationInput): Promise<RemediationView> {
  if (!tryGetDb()) {
    throw new Error("DATABASE_URL is not configured");
  }

  // RLS-BYPASS: HMAC-verified callback from the remediator sidecar (no
  // tenant session). Input.tenantId is included in the signed payload and
  // becomes the tenant FK on the inserted row; downstream reads under
  // tenant RLS enforce isolation.
  const [row] = await withBypassRls((db) =>
    db
      .insert(saasRemediations)
      .values({
        tenantId: input.tenantId,
        remediationId: input.remediationId,
        driftEventId: input.driftEventId,
        hostId: input.hostId,
        scanId: input.scanId,
        status: input.status,
        riskPolicyTier: input.riskPolicyTier,
        summary: input.summary,
        plan: input.plan,
      })
      .onConflictDoUpdate({
        target: saasRemediations.remediationId,
        set: {
          status: input.status,
          riskPolicyTier: input.riskPolicyTier,
          summary: input.summary,
          plan: input.plan,
          driftEventId: input.driftEventId,
          hostId: input.hostId,
          scanId: input.scanId,
          updatedAt: new Date(),
        },
      })
      .returning(),
  );
  return rowToView(row!);
}

export async function listRemediationsForTenant(tenantId: string): Promise<RemediationView[]> {
  if (!tryGetDb()) return [];
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasRemediations)
      .where(eq(saasRemediations.tenantId, tenantId))
      .orderBy(desc(saasRemediations.createdAt))
      .limit(200),
  );
  return rows.map(rowToView);
}

export async function getRemediationByDriftEvent(
  tenantId: string,
  driftEventId: string,
): Promise<RemediationView | null> {
  if (!tryGetDb()) return null;
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasRemediations)
      .where(
        and(
          eq(saasRemediations.tenantId, tenantId),
          eq(saasRemediations.driftEventId, driftEventId),
        ),
      )
      .orderBy(desc(saasRemediations.createdAt))
      .limit(1),
  );
  const row = rows[0];
  return row ? rowToView(row) : null;
}

export async function setRemediationStatus(
  tenantId: string,
  remediationId: string,
  status: RemediationStatus,
  actorUserId: string | null,
): Promise<RemediationView | null> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .update(saasRemediations)
      .set({
        status,
        approvedBy: status === "approved" ? actorUserId : null,
        approvedAt: status === "approved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasRemediations.tenantId, tenantId),
          eq(saasRemediations.remediationId, remediationId),
        ),
      )
      .returning(),
  );
  return row ? rowToView(row) : null;
}
