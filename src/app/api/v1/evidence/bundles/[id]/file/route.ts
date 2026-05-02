import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { getBaseline } from "@/lib/server/baseline-store";
import { getDriftEvents } from "@/lib/server/drift-engine";
import { NextResponse } from "next/server";

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
  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const hostId = idParsed.data;

  // If object-storage pre-signed URL template configured, redirect there.
  const urlTemplate = process.env.DO_SPACES_EVIDENCE_URL_TEMPLATE;
  if (urlTemplate) {
    const redirectUrl = urlTemplate.replace("{hostId}", encodeURIComponent(hostId));
    return NextResponse.redirect(redirectUrl, { status: 302 });
  }

  const baseline = getBaseline(hostId);
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

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="blackglass-evidence-${hostId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
