import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorRuntimeHealth } from "@/lib/server/collector-runtime";
import { jsonError } from "@/lib/server/http/json-error";
import { checkHealthSecretsProbeRate, clientIp } from "@/lib/server/rate-limit";
import { probeSecretBackendReachable } from "@/lib/server/secrets";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const b = baselineStoreHealth();
  const collector = collectorRuntimeHealth();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe");
  const secretsProbeRun = probe === "secrets";

  const body: Record<string, unknown> = {
    ok: true,
    service: "blackglass-console",
    /** What this response attests to — never implies SSH material was fetched unless a collect/scan ran elsewhere. */
    diagnostics_scope: secretsProbeRun
      ? "runtime_configuration+secret_backend_reachability"
      : "runtime_configuration",
    baseline_store: b.configured ? { path: b.path, writable: b.writable } : null,
    collector,
  };

  if (secretsProbeRun) {
    if (!checkHealthSecretsProbeRate(clientIp(request))) {
      return jsonError(429, "rate_limited");
    }
    body.secrets_probe = await probeSecretBackendReachable();
  }

  return NextResponse.json(body);
}
