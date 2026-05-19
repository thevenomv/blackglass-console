import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorRuntimeHealth } from "@/lib/server/collector-runtime";
import { jsonError } from "@/lib/server/http/json-error";
import { checkHealthSecretsProbeRate, clientIp } from "@/lib/server/rate-limit";
import { probeSecretBackendReachable } from "@/lib/server/secrets";
import { refreshPlanFromSpaces } from "@/lib/server/plan-store";
import { getDriftHistoryRepository } from "@/lib/server/store";
import { getLimits } from "@/lib/plan";
import { verifySession } from "@/lib/auth/session-signing";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

// ---------------------------------------------------------------------------
// Dependency probe helpers
// ---------------------------------------------------------------------------

async function probeRedis(): Promise<{ ok: boolean; backend: string; duration_ms: number; error?: string }> {
  const t0 = Date.now();
  const url = process.env.RATE_LIMIT_REDIS_URL?.trim() || process.env.REDIS_QUEUE_URL?.trim();
  if (!url) {
    return { ok: true, backend: "none", duration_ms: 0 };
  }
  try {
    const Redis = (await import("ioredis")).default;
    const tlsOpts = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
    const r = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, ...tlsOpts });
    await r.ping();
    await r.quit();
    return { ok: true, backend: url.startsWith("rediss://") ? "redis-tls" : "redis", duration_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, backend: "redis", duration_ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeSpaces(): Promise<{ ok: boolean; backend: string; duration_ms: number; error?: string }> {
  const t0 = Date.now();
  const key = process.env.DO_SPACES_KEY?.trim();
  const secret = process.env.DO_SPACES_SECRET?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  const endpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  if (!key || !secret || !bucket || !endpoint) {
    return { ok: true, backend: "none", duration_ms: 0 };
  }
  try {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const region = process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
    const client = new S3Client({ endpoint, region, credentials: { accessKeyId: key, secretAccessKey: secret }, forcePathStyle: false });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true, backend: "spaces", duration_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, backend: "spaces", duration_ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Refresh plan cache from Spaces (no-op if TTL still fresh or Spaces not configured).
  await refreshPlanFromSpaces();

  // Determine whether the caller is authenticated to decide response depth.
  // /api/health is intentionally kept reachable by uptime monitors without a session,
  // but internal operational detail (storage adapters, collector config, plan state)
  // is only returned to authenticated operators. Unauthenticated callers get ok+service only.
  const authRequired = process.env.AUTH_REQUIRED === "true";
  let authenticated = !authRequired; // dev/demo mode: always full response
  if (authRequired) {
    if (isClerkAuthEnabled()) {
      // In Clerk mode, require both a valid userId AND an active orgId — any
      // signed-in user without an org would otherwise get operational details.
      try {
        const { auth } = await import("@clerk/nextjs/server");
        const { userId, orgId } = await auth();
        authenticated = userId != null && orgId != null;
      } catch {
        authenticated = false;
      }
    } else {
      const jar = await cookies();
      const token = jar.get("bg-session")?.value;
      if (token) {
        const payload = await verifySession(token);
        authenticated = payload !== null;
      }
    }
  }

  if (!authenticated) {
    return NextResponse.json({ ok: true, service: "blackglass-console" });
  }

  const b = baselineStoreHealth();
  const dh = getDriftHistoryRepository();
  const collector = collectorRuntimeHealth();
  const limits = getLimits();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe");
  const secretsProbeRun = probe === "secrets";
  const redisProbeRun = probe === "redis";
  const spacesProbeRun = probe === "spaces";

  const rateLimitDistributed = Boolean(process.env.RATE_LIMIT_REDIS_URL?.trim());
  const ingestEnabled = Boolean(process.env.INGEST_API_KEY?.trim());

  const body: Record<string, unknown> = {
    ok: true,
    service: "blackglass-console",
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    diagnostics_scope: secretsProbeRun
      ? "runtime_configuration+secret_backend_reachability"
      : redisProbeRun
        ? "runtime_configuration+redis_reachability"
        : spacesProbeRun
          ? "runtime_configuration+spaces_reachability"
          : "runtime_configuration",
    plan: limits.name,
    host_cap: limits.maxHosts === -1 ? null : limits.maxHosts,
    rate_limit_distributed: rateLimitDistributed,
    ingest: { enabled: ingestEnabled },
    baseline_store: b.configured
      ? { adapter: b.adapter, path: b.path, writable: b.writable }
      : { adapter: b.adapter },
    drift_history_store: { adapter: dh.adapter },
    collector,
  };

  if (secretsProbeRun) {
    if (!(await checkHealthSecretsProbeRate(clientIp(request)))) {
      return jsonError(429, "rate_limited");
    }
    try {
      body.secrets_probe = await Promise.race([
        probeSecretBackendReachable(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Secrets probe timed out after 5s")), 5_000),
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[health] Secrets probe failed:", message);
      body.secrets_probe = { ok: false, error: message };
    }
  }

  if (redisProbeRun) {
    try {
      body.redis_probe = await Promise.race([
        probeRedis(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis probe timed out after 5s")), 5_000),
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[health] Redis probe failed:", message);
      body.redis_probe = { ok: false, error: message };
    }
  }

  if (spacesProbeRun) {
    try {
      body.spaces_probe = await Promise.race([
        probeSpaces(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Spaces probe timed out after 8s")), 8_000),
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[health] Spaces probe failed:", message);
      body.spaces_probe = { ok: false, error: message };
    }
  }

  return NextResponse.json(body);
}
