import { loadFleetSnapshot } from "@/lib/server/inventory";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { NextResponse } from "next/server";
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
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const snapshot = await loadFleetSnapshot();
  return NextResponse.json(snapshot);
}
