/**
 * GET  /api/v1/sandbox  — get this tenant's active sandbox status
 * POST /api/v1/sandbox  — provision a new sandbox (or return existing)
 * DELETE /api/v1/sandbox — destroy the sandbox immediately
 */

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { withTenantRls, schema } from "@/db";
import { eq, and, ne } from "drizzle-orm";
import { provisionSandbox, destroySandbox } from "@/lib/server/services/sandbox-provisioner";
import {
  enqueueSandboxProvision,
  enqueueSandboxCleanup,
} from "@/lib/server/queue/sandbox-queue";
import { emitSaasAudit } from "@/lib/saas/event-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const { saasSandboxes } = schema;

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("hosts.manage", ["admin", "operator"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ sandbox: null }, { headers: { "x-request-id": requestId } });
  }

  const tenantId = access.ctx.tenant.id;
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasSandboxes)
      .where(
        and(eq(saasSandboxes.tenantId, tenantId), ne(saasSandboxes.status, "destroyed")),
      ),
  );

  return NextResponse.json(
    { sandbox: rows[0] ?? null },
    { headers: { "x-request-id": requestId } },
  );
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("hosts.manage", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(403, "forbidden", "Sandbox feature requires SaaS mode.", requestId);
  }

  const tenantId = access.ctx.tenant.id;

  // Check for DO_API_TOKEN
  if (!process.env.DO_API_TOKEN?.trim()) {
    return jsonError(503, "not_configured", "Sandbox provisioning is not enabled on this deployment.", requestId);
  }

  // Provision (idempotent — returns existing sandbox ID if already active)
  let sandboxId: string;
  try {
    sandboxId = await provisionSandbox(tenantId);
  } catch (err) {
    console.error("[sandbox-route] provisionSandbox failed", err);
    return jsonError(500, "provision_failed", "Failed to initiate sandbox provisioning.", requestId);
  }

  // Enqueue activation job
  await enqueueSandboxProvision(sandboxId, tenantId);

  // Schedule cleanup at TTL — read under the caller's tenant scope so RLS
  // catches any cross-tenant id mix-up (sandboxId always belongs to this tenant
  // because provisionSandbox returned it for this tenantId, but the explicit
  // RLS check is the safer default).
  const [sandbox] = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasSandboxes)
      .where(and(eq(saasSandboxes.id, sandboxId), eq(saasSandboxes.tenantId, tenantId))),
  );
  if (sandbox?.ttlExpiresAt) {
    await enqueueSandboxCleanup(sandboxId, tenantId, sandbox.ttlExpiresAt);
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "sandbox.provisioned",
    targetType: "sandbox",
    targetId: sandboxId,
    metadata: { region: sandbox?.region },
  });

  return NextResponse.json(
    { sandbox },
    { status: 202, headers: { "x-request-id": requestId } },
  );
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("hosts.manage", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(403, "forbidden", "Sandbox feature requires SaaS mode.", requestId);
  }

  const tenantId = access.ctx.tenant.id;

  const [sandbox] = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasSandboxes)
      .where(
        and(eq(saasSandboxes.tenantId, tenantId), ne(saasSandboxes.status, "destroyed")),
      ),
  );
  if (!sandbox) {
    return jsonError(404, "not_found", "No active sandbox.", requestId);
  }

  try {
    await destroySandbox(sandbox.id);
  } catch (err) {
    console.error("[sandbox-route] destroySandbox failed", err);
    return jsonError(500, "destroy_failed", "Failed to destroy sandbox.", requestId);
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "sandbox.destroyed",
    targetType: "sandbox",
    targetId: sandbox.id,
    metadata: {},
  });

  return new NextResponse(null, { status: 204, headers: { "x-request-id": requestId } });
}
