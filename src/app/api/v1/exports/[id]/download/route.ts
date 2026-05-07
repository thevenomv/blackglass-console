/**
 * GET /api/v1/exports/[id]/download
 *
 * Returns either a 302 redirect to a Spaces signed URL, or — when the
 * deployment has no Spaces — the JSON bundle inline as an attachment.
 *
 * The presigned URL is generated fresh on every request so it can stay
 * short-lived (5 min) even when the export row's `expiresAt` is days away;
 * losing the link means asking the workspace owner to come back to the UI.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getExportForDownload } from "@/lib/server/services/export-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;
  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid export id.", requestId);
  }
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Exports require SaaS mode.", requestId);
  }

  const result = await getExportForDownload(access.ctx.tenant.id, id);
  if (result.kind === "error") {
    return jsonError(result.status, "export_unavailable", result.message, requestId);
  }
  if (result.kind === "spaces") {
    return NextResponse.redirect(result.signedUrl, { status: 302 });
  }
  // Inline path
  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="blackglass-export-${id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
      "x-request-id": requestId,
    },
  });
}
