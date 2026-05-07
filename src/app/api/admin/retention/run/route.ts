/**
 * POST /api/admin/retention/run
 *
 * Trigger a one-shot retention sweep across every tenant with a configured
 * policy.  Intended for operator use (debugging, on-demand cleanup) and for
 * a scheduled HTTP cron (e.g. DigitalOcean Functions / GitHub Actions
 * `curl -X POST -H "X-Cron-Secret: ..." ...`).
 *
 * Auth:
 *   - In SaaS mode: owner+admin via `secrets.manage` permission.
 *   - For external cron: pass `X-Cron-Secret` matching `RETENTION_CRON_SECRET`.
 *     This bypasses the normal auth gate so the cron can run from a service
 *     account that has no Clerk session.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { pruneAllTenants } from "@/lib/server/services/retention-service";
import { timingSafeEqual } from "node:crypto";

function eqConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // ── External cron path ────────────────────────────────────────────────────
  const cronSecret = process.env.RETENTION_CRON_SECRET?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (cronSecret && headerSecret && eqConstantTime(cronSecret, headerSecret)) {
    const results = await pruneAllTenants();
    return NextResponse.json(
      { ok: true, source: "cron", results },
      { headers: { "x-request-id": requestId } },
    );
  }

  // ── Operator UI path ──────────────────────────────────────────────────────
  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const results = await pruneAllTenants();
  return NextResponse.json(
    { ok: true, source: "operator", results },
    { headers: { "x-request-id": requestId } },
  );
}

// Allow probing the route from cron schedulers without leaking secrets.
export async function GET(request: Request) {
  return jsonError(405, "method_not_allowed", "POST only.", getOrCreateRequestId(request));
}
