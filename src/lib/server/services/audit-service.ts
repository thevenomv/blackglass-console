/**
 * Tenant audit log reads — wraps `saas_audit_events` with cursor pagination
 * and a small filter surface (action substring, actor, time range).
 *
 * Writes still go through `emitSaasAudit` in `src/lib/saas/event-log.ts`.
 */

import { withTenantRls, schema, tryGetDb } from "@/db";
import { and, desc, eq, ilike, lt, gte } from "drizzle-orm";

const { saasAuditEvents } = schema;

export interface SaasAuditEventView {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SaasAuditFilter {
  /** Substring match on `action` (ILIKE). */
  action?: string;
  /** Exact actor_user_id (Clerk user id or `api-key:{keyId}`). */
  actorUserId?: string;
  /** Lower-bound inclusive (ISO timestamp). */
  sinceIso?: string;
  /** Pagination cursor — `createdAt` of the previous page's last row. */
  cursorIso?: string;
  /** Page size (1–200, default 50). */
  limit?: number;
}

export interface SaasAuditPage {
  items: SaasAuditEventView[];
  nextCursor: string | null;
}

export async function listSaasAudit(
  tenantId: string,
  filter: SaasAuditFilter,
): Promise<SaasAuditPage> {
  if (!tryGetDb()) return { items: [], nextCursor: null };

  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));

  const conditions = [eq(saasAuditEvents.tenantId, tenantId)];
  if (filter.action?.trim()) {
    conditions.push(ilike(saasAuditEvents.action, `%${filter.action.trim()}%`));
  }
  if (filter.actorUserId?.trim()) {
    conditions.push(eq(saasAuditEvents.actorUserId, filter.actorUserId.trim()));
  }
  if (filter.sinceIso) {
    const d = new Date(filter.sinceIso);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(gte(saasAuditEvents.createdAt, d));
    }
  }
  if (filter.cursorIso) {
    const d = new Date(filter.cursorIso);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(lt(saasAuditEvents.createdAt, d));
    }
  }

  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasAuditEvents)
      .where(and(...conditions))
      .orderBy(desc(saasAuditEvents.createdAt))
      .limit(limit + 1),
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}
