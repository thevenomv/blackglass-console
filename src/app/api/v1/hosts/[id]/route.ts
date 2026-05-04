/**
 * GET /api/v1/hosts/:id
 * Returns a HostRecord for the requested host.
 */

import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { loadHosts } from "@/lib/server/inventory";
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(_request);
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

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const id = idParsed.data;

  // Try real inventory first (works when collector is configured).
  const hosts = await loadHosts();
  const host = hosts.find((h) => h.id === id);
  if (host) return NextResponse.json(host);

  return jsonError(404, "host_not_found");
}
