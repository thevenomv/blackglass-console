/**
 * PATCH  /api/v1/collector/hosts/[id] — update label / sshUser / sshPort / enabled
 * DELETE /api/v1/collector/hosts/[id] — remove a registered host
 */

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { withTenantRls, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const { saasCollectorHosts } = schema;

type Params = { params: Promise<{ id: string }> };

// ── PATCH ─────────────────────────────────────────────────────────────────────
const patchSchema = z.object({
  label: z.string().max(120).nullable().optional(),
  sshUser: z.string().min(1).max(64).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const requestId = getOrCreateRequestId(request);

  const access = await requireSaasStepUpMutation("hosts.manage", canRunScansForTenant);
  if (!access.ok) return access.response;
  const { ctx } = access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.", requestId);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", requestId);
  }

  const updates: Partial<typeof saasCollectorHosts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.sshUser !== undefined) updates.sshUser = parsed.data.sshUser;
  if (parsed.data.sshPort !== undefined) updates.sshPort = parsed.data.sshPort;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

  const [host] = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .update(saasCollectorHosts)
      .set(updates)
      .where(and(eq(saasCollectorHosts.id, id), eq(saasCollectorHosts.tenantId, ctx.tenant.id)))
      .returning(),
  );

  if (!host) return jsonError(404, "not_found", "Host not found.", requestId);

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "collector_host.updated",
    targetType: "collector_host",
    targetId: id,
    metadata: parsed.data,
  });

  return jsonWithRequestId({ host }, requestId);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const requestId = getOrCreateRequestId(request);

  const access = await requireSaasStepUpMutation("hosts.manage", canRunScansForTenant);
  if (!access.ok) return access.response;
  const { ctx } = access;

  const [deleted] = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .delete(saasCollectorHosts)
      .where(and(eq(saasCollectorHosts.id, id), eq(saasCollectorHosts.tenantId, ctx.tenant.id)))
      .returning({ id: saasCollectorHosts.id }),
  );

  if (!deleted) return jsonError(404, "not_found", "Host not found.", requestId);

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "collector_host.removed",
    targetType: "collector_host",
    targetId: id,
    metadata: {},
  });

  return new NextResponse(null, { status: 204, headers: { "x-request-id": requestId } });
}
