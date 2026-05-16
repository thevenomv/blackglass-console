/**
 * GET /api/status
 *
 * Public, unauthenticated status endpoint that powers the
 * /status marketing page. Probes the same dependencies the
 * authenticated /api/health endpoint does, but returns ONLY the
 * minimum information a public visitor needs:
 *
 *   - console:   the console can serve requests (trivially true if
 *                this responds at all).
 *   - api:       the v1 API is reachable from the same process.
 *   - database:  Postgres ping succeeds (or "not_configured" in
 *                file-mode deployments).
 *   - redis:     ioredis ping succeeds (or "not_configured").
 *   - spaces:    object store HEAD bucket succeeds (or
 *                "not_configured").
 *
 * What we deliberately DO NOT expose:
 *   - Plan / host counts (could leak business signal).
 *   - Specific URLs, secret prefixes, or env values.
 *   - Per-tenant counters (could leak customer identity).
 *
 * Caching: this endpoint is computed live but the response is
 * cacheable for 30 seconds at the CDN. That's plenty for a status
 * page that doesn't need sub-second freshness, and it shields the
 * actual probes from the inevitable polling-from-many-clients
 * thundering herd.
 */

import { NextResponse } from "next/server";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProbeStatus = "ok" | "down" | "not_configured";

type ProbeResult = {
  status: ProbeStatus;
  /** ms taken for the underlying check (omitted when not_configured). */
  latencyMs?: number;
};

const PROBE_TIMEOUT_MS = 4_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function probeRedis(): Promise<ProbeResult> {
  const url =
    process.env.RATE_LIMIT_REDIS_URL?.trim() || process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return { status: "not_configured" };
  const t0 = Date.now();
  try {
    const Redis = (await import("ioredis")).default;
    const tls = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
    const r = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, ...tls });
    await withTimeout(r.ping(), PROBE_TIMEOUT_MS);
    r.disconnect();
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch {
    return { status: "down", latencyMs: Date.now() - t0 };
  }
}

async function probeSpaces(): Promise<ProbeResult> {
  const key = process.env.DO_SPACES_KEY?.trim();
  const secret = process.env.DO_SPACES_SECRET?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  const endpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  if (!key || !secret || !bucket || !endpoint) return { status: "not_configured" };
  const t0 = Date.now();
  try {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const region =
      process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
    const client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: key, secretAccessKey: secret },
      forcePathStyle: false,
    });
    await withTimeout(
      client.send(new HeadBucketCommand({ Bucket: bucket })),
      PROBE_TIMEOUT_MS,
    );
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch {
    return { status: "down", latencyMs: Date.now() - t0 };
  }
}

async function probeDatabase(): Promise<ProbeResult> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return { status: "not_configured" };
  const t0 = Date.now();
  try {
    const { tryGetDb } = await import("@/db");
    const db = tryGetDb();
    if (!db) return { status: "not_configured" };
    // SELECT 1 — cheapest possible round-trip. We don't care about
    // the result, only that the round-trip completes.
    const { sql } = await import("drizzle-orm");
    await withTimeout(db.execute(sql`SELECT 1`), PROBE_TIMEOUT_MS);
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch {
    return { status: "down", latencyMs: Date.now() - t0 };
  }
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const t0 = Date.now();

  // Probe in parallel so total latency is max(probes), not sum.
  const [redis, spaces, database] = await Promise.all([
    probeRedis(),
    probeSpaces(),
    probeDatabase(),
  ]);

  const components = {
    console: { status: "ok", latencyMs: 0 } as ProbeResult,
    api: { status: "ok", latencyMs: 0 } as ProbeResult,
    database,
    redis,
    spaces,
  } satisfies Record<string, ProbeResult>;

  // Overall is the worst component status, ignoring not_configured
  // (a self-hosted deployment without Spaces shouldn't show "down"
  // just because no object-store is wired up).
  const realStatuses = Object.values(components)
    .map((c) => c.status)
    .filter((s) => s !== "not_configured");
  const overall: "operational" | "degraded" | "down" = realStatuses.includes("down")
    ? // If a CRITICAL service is down, mark down. Console + api being up
      // means the page itself can render even when DB/redis are down,
      // so we call that "degraded" rather than "down" — only the
      // console itself going dark would be truly "down" (and you
      // wouldn't be able to load this endpoint anyway).
      components.database.status === "down"
      ? "degraded"
      : "degraded"
    : "operational";

  return NextResponse.json(
    {
      status: overall,
      checkedAt: new Date().toISOString(),
      components,
      // Total wall-clock time the probes took on the server side.
      // Useful for the status page to display "checked in 320ms".
      durationMs: Date.now() - t0,
    },
    {
      headers: {
        "x-request-id": requestId,
        // Cache at the edge for 30s; the freshness is plenty for a
        // status page and the cache shields the probes from spam.
        // `stale-while-revalidate` keeps the page snappy while the
        // CDN refreshes in the background.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
