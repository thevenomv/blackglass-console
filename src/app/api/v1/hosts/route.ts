import { loadHosts } from "@/lib/server/inventory";
import { getLimits } from "@/lib/plan";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { NextResponse } from "next/server";
import { withinHostAllowance } from "@/lib/saas/operations";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;

    const all = await loadHosts();
    const sub = access.mode === "saas" ? access.ctx.subscription : null;
    const limit = sub && sub.hostLimit >= 0 ? sub.hostLimit : null;
    const items = limit !== null && all.length > limit ? all.slice(0, limit) : all;
    const cap = sub ? withinHostAllowance(sub, all.length, 0) : { ok: true as const };
    return NextResponse.json({
      items,
      saas:
        access.mode === "saas"
          ? {
              plan_code: access.ctx.subscription.planCode,
              host_limit: access.ctx.subscription.hostLimit,
              host_count: all.length,
              at_cap: !cap.ok,
            }
          : undefined,
    });
  }

  const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const limits = getLimits();
  const all = await loadHosts();
  const items = limits.maxHosts === -1 ? all : all.slice(0, limits.maxHosts);
  return NextResponse.json({
    items,
    plan: limits.name,
    host_cap: limits.maxHosts === -1 ? null : limits.maxHosts,
    at_cap: limits.maxHosts !== -1 && all.length >= limits.maxHosts,
  });
}
