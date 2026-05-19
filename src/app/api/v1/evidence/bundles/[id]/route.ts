import { EVIDENCE_BUNDLE_META } from "@/lib/server/evidence-catalog";
import { jsonError, rateLimitedResponse, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return rateLimitedResponse(requestId);
  }

  // Use SaaS/legacy unified permission check so Clerk-mode callers are not 401'd
  // and legacy callers continue to use the role allowlist. Mirrors the sibling
  // bundles/[id]/file/route.ts which already used requireSaasOrLegacyPermission.
  const access = await requireSaasOrLegacyPermission("evidence.view", ["auditor", "operator", "admin"]);
  if (!access.ok) return access.response;

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error, requestId);

  const id = idParsed.data;
  const meta = EVIDENCE_BUNDLE_META[id];
  if (!meta) return jsonError(404, "bundle_not_found", requestId);

  const u = new URL(request.url);
  const fileUrl = `${u.origin}/api/v1/evidence/bundles/${encodeURIComponent(id)}/file`;

  return NextResponse.json({
    bundle_id: id,
    sha256: meta.sha256,
    bytes: meta.bytes,
    expires_in_seconds: meta.expiresInSeconds,
    download_url: fileUrl,
    generated_at: new Date().toISOString(),
  });
}
