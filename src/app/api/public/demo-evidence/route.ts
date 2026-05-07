/**
 * GET /api/public/demo-evidence
 *
 * Returns a downloadable JSON evidence bundle built from the deterministic
 * demo seed.  No auth required — this is the same data shown on /demo and
 * is intentionally sharable so prospects can hand it to their security
 * team without spinning up a workspace.
 *
 * Tamper evident: the response includes a `sha256` over the bundle body so
 * the recipient can verify integrity.
 *
 * Rate limited the same way as the public sandbox feed.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  DEMO_AUDIT,
  DEMO_DRIFT,
  DEMO_HOSTS,
  DEMO_REMEDIATIONS,
  DEMO_TENANT_NAME,
  DEMO_TENANT_SLUG,
} from "@/lib/demo/seed";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many download requests.", requestId);
  }

  const generatedAt = new Date().toISOString();

  const payload = {
    schema: "blackglass-demo-evidence/1",
    tenant: { name: DEMO_TENANT_NAME, slug: DEMO_TENANT_SLUG, demo: true },
    generatedAt,
    summary: {
      hosts: DEMO_HOSTS.length,
      driftFindings: DEMO_DRIFT.length,
      remediationItems: DEMO_REMEDIATIONS.length,
      auditEvents: DEMO_AUDIT.length,
    },
    hosts: DEMO_HOSTS,
    drift: DEMO_DRIFT,
    remediations: DEMO_REMEDIATIONS,
    audit: DEMO_AUDIT,
    notes: [
      "This is a deterministic sample bundle. No real tenant data is included.",
      "The 'sha256' field at the top level is computed over the JSON body without itself.",
      "Use the BLACKGLASS console to download a real, signed evidence bundle for your workspace.",
    ],
  };

  const body = JSON.stringify(payload, null, 2);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const wrapped = JSON.stringify({ sha256, ...payload }, null, 2);

  const filename = `blackglass-demo-evidence-${generatedAt.slice(0, 10)}.json`;
  return new NextResponse(wrapped, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "x-request-id": requestId,
    },
  });
}
