import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorRuntimeHealth } from "@/lib/server/collector-runtime";
import { jsonError } from "@/lib/server/http/json-error";
import { checkHealthSecretsProbeRate, clientIp } from "@/lib/server/rate-limit";
import { probeSecretBackendReachable } from "@/lib/server/secrets";
import { refreshPlanFromSpaces } from "@/lib/server/plan-store";
import { getDriftHistoryRepository } from "@/lib/server/store";
import { getLimits } from "@/lib/plan";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Refresh plan cache from Spaces (no-op if TTL still fresh or Spaces not configured).
  await refreshPlanFromSpaces();

  const b = baselineStoreHealth();
  const dh = getDriftHistoryRepository();
  const collector = collectorRuntimeHealth();
  const limits = getLimits();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe");
  const secretsProbeRun = probe === "secrets";

  const body: Record<string, unknown> = {
    ok: true,
    service: "blackglass-console",
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    diagnostics_scope: secretsProbeRun
      ? "runtime_configuration+secret_backend_reachability"
      : "runtime_configuration",
    plan: limits.name,
    host_cap: limits.maxHosts === -1 ? null : limits.maxHosts,
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
