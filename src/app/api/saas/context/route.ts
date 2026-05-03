import { NextResponse } from "next/server";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { listMembershipsForTenant } from "@/lib/saas/tenant-service";
import { getSeatUsage } from "@/lib/saas/seats";
import { isTrialReadOnlyState } from "@/lib/saas/trial";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { isPaidSeatRole } from "@/lib/saas/tenant-role";
import { checkSaasContextRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!(await checkSaasContextRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  if (!isClerkAuthEnabled()) {
    return NextResponse.json({ clerk: false });
  }
  try {
    const ctx = await requireTenantAuth();
    const memberships = await listMembershipsForTenant(ctx.tenant.id);
    const seatUsage = getSeatUsage(memberships, ctx.subscription.paidSeatLimit);
    const trialReadOnly = isTrialReadOnlyState(ctx.subscription);
    return NextResponse.json({
      clerk: true,
      tenantId: ctx.tenant.id,
      orgName: ctx.tenant.name,
      role: ctx.role,
      planCode: ctx.subscription.planCode,
      status: ctx.subscription.status,
      trialEndsAt: ctx.subscription.trialEndsAt?.toISOString() ?? null,
      hostLimit: ctx.subscription.hostLimit,
      paidSeatLimit: ctx.subscription.paidSeatLimit,
      seatUsage,
      trialReadOnly,
      members: memberships.map((m) => ({
        userId: m.userId,
        role: m.role,
        status: m.status,
        paidSeat: isPaidSeatRole(m.role),
        joinedAt: m.joinedAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof SaasAuthError) {
      return NextResponse.json(
        { clerk: true, error: e.code, detail: e.message },
        { status: e.status },
      );
    }
    throw e;
  }
}
