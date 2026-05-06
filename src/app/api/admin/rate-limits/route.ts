/**
 * GET /api/admin/rate-limits
 *
 * Returns active rate-limit bucket stats for operator visibility.
 *
 * - When Redis is configured (RATE_LIMIT_REDIS_URL): returns per-key sorted-set sizes.
 * - When Redis is absent: returns the in-process memory bucket summary.
 *
 * Auth: requires `admin` or `operator` role (legacy) / admin Clerk role (SaaS).
 *
 * Response body:
 * {
 *   backend: "redis" | "memory",
 *   keys: Array<{ key: string; activeHits: number }>,
 *   generatedAt: string  // ISO timestamp
 * }
 */

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getRateLimitStats } from "@/lib/server/rate-limit-redis";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // `secrets.manage` is owner+admin only in the Clerk permission matrix.
  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const redisStats = await getRateLimitStats();

  if (redisStats !== null) {
    return NextResponse.json(
      {
        backend: "redis",
        keys: redisStats,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "x-request-id": requestId } },
    );
  }

  // Redis not configured — memory backend, no cross-replica visibility.
  return NextResponse.json(
    {
      backend: "memory",
      note: "Set RATE_LIMIT_REDIS_URL for per-key stats. Memory backend shares no state across replicas.",
      keys: [],
      generatedAt: new Date().toISOString(),
    },
    { headers: { "x-request-id": requestId } },
  );
}
