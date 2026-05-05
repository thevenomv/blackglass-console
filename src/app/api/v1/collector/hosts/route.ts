/**
 * GET  /api/v1/collector/hosts — list this tenant's registered SSH collector hosts
 * POST /api/v1/collector/hosts — register a new host
 */

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { requireSaasOrLegacyPermission, requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { withTenantRls, schema } from "@/db";
import { eq } from "drizzle-orm";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const { saasCollectorHosts } = schema;

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  const access = await requireSaasOrLegacyPermission("reports.view", ["viewer", "operator", "admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonWithRequestId({ hosts: [] }, requestId);
  }

  const { tenant } = access.ctx;

  const hosts = await withTenantRls(tenant.id, (db) =>
    db
      .select()
      .from(saasCollectorHosts)
      .where(eq(saasCollectorHosts.tenantId, tenant.id))
      .orderBy(saasCollectorHosts.createdAt),
  );

  return jsonWithRequestId({ hosts }, requestId);
}

// ── POST ──────────────────────────────────────────────────────────────────────
const addHostSchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/, "Invalid hostname or IP"),
  label: z.string().max(120).optional(),
  sshUser: z.string().min(1).max(64).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
});

export async function POST(request: Request) {
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

  const parsed = addHostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", requestId);
  }

  const { hostname, label, sshUser, sshPort } = parsed.data;

  const existing = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .select({ id: saasCollectorHosts.id })
      .from(saasCollectorHosts)
      .where(eq(saasCollectorHosts.tenantId, ctx.tenant.id))
      .limit(1),
  );

  if (existing.length >= ctx.subscription.hostLimit) {
    return jsonError(
      403,
      "host_limit_reached",
      `Your plan allows up to ${ctx.subscription.hostLimit} hosts. Upgrade to add more.`,
      requestId,
    );
  }

  const [host] = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .insert(saasCollectorHosts)
      .values({
        tenantId: ctx.tenant.id,
        hostname,
        label: label ?? null,
        sshUser: sshUser ?? "blackglass",
        sshPort: sshPort ?? 22,
      })
      .returning(),
  );

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "collector_host.added",
    targetType: "collector_host",
    targetId: host.id,
    metadata: { hostname, label, sshUser: host.sshUser, sshPort: host.sshPort },
  });

  return NextResponse.json({ host }, { status: 201, headers: { "x-request-id": requestId } });
}
