import { EVIDENCE_BUNDLE_META } from "@/lib/server/evidence-catalog";
import { zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const guard = await requireRole(["auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const id = idParsed.data;
  const meta =
    EVIDENCE_BUNDLE_META[id] ??
    ({
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      expiresInSeconds: 600,
      bytes: 4096,
    } as const);

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
