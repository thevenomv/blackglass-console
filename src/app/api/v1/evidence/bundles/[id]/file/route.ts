import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { getBaseline } from "@/lib/server/baseline-store";
import { getDriftEvents } from "@/lib/server/drift-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/evidence/bundles/:id/file
 *
 * Builds and streams a JSON evidence bundle containing:
 *  - The baseline snapshot for the requested host (id = hostId)
 *  - All drift events recorded for that host
 *
 * The bundle ID is treated as a host ID so callers can request per-host
 * artifacts. When a DO_SPACES pre-signed URL pattern is configured via
 * DO_SPACES_EVIDENCE_URL_TEMPLATE (value: URL with {hostId} placeholder),
 * the handler redirects to that pre-signed URL instead of streaming inline.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireRole(["auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const hostId = idParsed.data;

  // If object-storage pre-signed URL template configured, redirect there.
  const urlTemplate = process.env.DO_SPACES_EVIDENCE_URL_TEMPLATE;
  if (urlTemplate) {
    const occurrences = (urlTemplate.match(/\{hostId\}/g) ?? []).length;
    if (occurrences !== 1) {
      return jsonError(500, "invalid_template", "DO_SPACES_EVIDENCE_URL_TEMPLATE must contain exactly one {hostId} placeholder");
    }
    const redirectUrl = urlTemplate.replace("{hostId}", encodeURIComponent(hostId));
    try {
      const parsed = new URL(redirectUrl);
      if (parsed.protocol !== "https:") {
        return jsonError(500, "invalid_redirect_url", "DO_SPACES_EVIDENCE_URL_TEMPLATE must resolve to an HTTPS URL");
      }
    } catch {
      return jsonError(500, "invalid_redirect_url", "Computed redirect URL is not valid");
    }
    return NextResponse.redirect(redirectUrl, { status: 302 });
  }

  const baseline = await getBaseline(hostId);
  const events = getDriftEvents(hostId);

  if (!baseline && events.length === 0) {
    return jsonError(404, "evidence_not_found");
  }

  const bundle = {
    bundle_id: hostId,
    generated_at: new Date().toISOString(),
    host_id: hostId,
    baseline: baseline ?? null,
    drift_events: events,
    event_count: events.length,
  };

  const body = JSON.stringify(bundle, null, 2);

  // Guard against unexpectedly large bundles causing OOM.
  const MAX_BUNDLE_BYTES = 50 * 1024 * 1024; // 50 MB
  if (Buffer.byteLength(body, "utf8") > MAX_BUNDLE_BYTES) {
    return jsonError(413, "payload_too_large", "Evidence bundle exceeds 50 MB");
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="blackglass-evidence-${hostId}.json"`,
      "Content-Length": String(Buffer.byteLength(body, "utf8")),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
