/**
 * GET /api/public/demo-evidence
 *
 * Default: branded PDF sample pack (same fictional data as /demo).
 * ?format=json — downloadable JSON with a top-level sha256 for integrity checks.
 *
 * No auth required. Rate limited like other public read endpoints.
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
import { generateDemoEvidencePdf } from "@/lib/server/demo-evidence-pdf";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many download requests.", requestId);
  }

  const generatedAt = new Date().toISOString();
  const url = new URL(request.url);
  const asJson = url.searchParams.get("format") === "json";

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
      "Customers download a signed evidence bundle from the Blackglass console.",
      "The default download for this URL is a PDF overview; add ?format=json for machine-readable JSON.",
    ],
  };

  if (asJson) {
    const body = JSON.stringify(payload, null, 2);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const wrapped = JSON.stringify({ sha256, ...payload }, null, 2);
    const filename = `blackglass-sample-evidence-${generatedAt.slice(0, 10)}.json`;
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

  const pdfBytes = await generateDemoEvidencePdf({
    tenantName: DEMO_TENANT_NAME,
    tenantSlug: DEMO_TENANT_SLUG,
    generatedAt,
    hosts: DEMO_HOSTS,
    drift: DEMO_DRIFT,
    remediations: DEMO_REMEDIATIONS,
    audit: DEMO_AUDIT,
  });
  const buf = new Uint8Array(pdfBytes).slice().buffer;
  const filename = `blackglass-sample-evidence-${generatedAt.slice(0, 10)}.pdf`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "x-request-id": requestId,
    },
  });
}
