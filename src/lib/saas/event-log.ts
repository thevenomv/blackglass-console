import { tryGetDb, withTenantRls, schema } from "@/db";

type AuditInput = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

type SecurityInput = {
  tenantId: string;
  userId?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  eventType: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function emitSaasAudit(row: AuditInput): Promise<void> {
  if (!tryGetDb()) return;
  try {
    await withTenantRls(row.tenantId, async (db) => {
      await db.insert(schema.saasAuditEvents).values({
        tenantId: row.tenantId,
        actorUserId: row.actorUserId ?? null,
        action: row.action,
        targetType: row.targetType ?? null,
        targetId: row.targetId ?? null,
        metadata: row.metadata ?? {},
      });
    });
  } catch (e) {
    console.error("[saas-audit] insert failed", e);
  }
}

export async function emitSaasSecurity(row: SecurityInput): Promise<void> {
  if (!tryGetDb()) return;
  try {
    await withTenantRls(row.tenantId, async (db) => {
      await db.insert(schema.saasSecurityEvents).values({
        tenantId: row.tenantId,
        userId: row.userId ?? null,
        severity: row.severity,
        eventType: row.eventType,
        ip: row.ip ?? null,
        userAgent: row.userAgent ?? null,
        metadata: row.metadata ?? {},
      });
    });
  } catch (e) {
    console.error("[saas-security] insert failed", e);
  }
}
