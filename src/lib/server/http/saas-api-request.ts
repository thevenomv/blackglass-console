import { NextResponse } from "next/server";
import type { TenantAuthContext } from "@/lib/saas/auth-context";
import { applySaasSentryContext } from "@/lib/observability/sentry-saas";
import { getOrCreateRequestId } from "./request-id";

export function inboundRequestId(request: Request): string {
  return getOrCreateRequestId(request);
}

export async function bindSaasTelemetry(request: Request, ctx: TenantAuthContext): Promise<string> {
  const requestId = getOrCreateRequestId(request);
  await applySaasSentryContext({
    requestId,
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    clerkOrgId: ctx.tenant.clerkOrgId,
    plan: ctx.subscription.planCode,
  });
  return requestId;
}

export function jsonWithRequestId(body: unknown, requestId: string, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.json(body, { ...init, headers });
}
