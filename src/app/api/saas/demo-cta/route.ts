import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { readJsonBodyOptional, jsonError } from "@/lib/server/http/json-error";
import { z } from "zod";
import { checkDemoCtaRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().optional(),
  source: z.string().max(120).optional(),
});

export async function GET() {
  return NextResponse.json({
    ok: true,
    clerk: isClerkAuthEnabled(),
    accept: "POST application/json with optional { email, source }",
  });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkDemoCtaRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) {
    return jsonError(400, "invalid_body", "Expected optional email and source.");
  }

  if (!isClerkAuthEnabled()) {
    return NextResponse.json({ ok: true, accepted: true, clerk: false });
  }

  try {
    const ctx = await requireTenantAuth();
    await emitSaasAudit({
      tenantId: ctx.tenant.id,
      actorUserId: ctx.userId,
      action: "demo.cta_submitted",
      targetType: "lead",
      targetId: parsed.data.email ?? "anonymous",
      metadata: { source: parsed.data.source ?? "unknown" },
    });
    return NextResponse.json({ ok: true, accepted: true, clerk: true });
  } catch (e) {
    if (e instanceof SaasAuthError) {
      return NextResponse.json({ ok: true, accepted: true, clerk: true, note: "no_tenant_context" });
    }
    throw e;
  }
}
