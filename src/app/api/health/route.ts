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
    const jar = await cookies();
    const token = jar.get("bg-session")?.value;
    if (token) {
      const payload = await verifySession(token);
      authenticated = payload !== null;
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

  const rateLimitDistributed = Boolean(process.env.RATE_LIMIT_REDIS_URL?.trim());
  const ingestEnabled = Boolean(process.env.INGEST_API_KEY?.trim());

  const body: Record<string, unknown> = {
    ok: true,
    service: "blackglass-console",
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    diagnostics_scope: secretsProbeRun
      ? "runtime_configuration+secret_backend_reachability"
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
    body.secrets_probe = await probeSecretBackendReachable();
  }

  return NextResponse.json(body);
}
