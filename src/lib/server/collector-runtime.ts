import {
  collectorHasHostSlots,
  collectorHostSlotCount,
  collectorMaxParallelSsh,
} from "@/lib/server/collector-env";
import { collectorStructuredLoggingEnabled } from "@/lib/server/collector-events";
import { activeSecretProviderMode, credentialSourceConfigured } from "@/lib/server/secrets";

export type CollectorRuntimeHealth = {
  /** `COLLECTOR_HOST_1` set and credential source env satisfied for `SECRET_PROVIDER`. */
  configured: boolean;
  host_slots: number;
  has_host_slots: boolean;
  credential_source_ready: boolean;
  secret_provider: string;
  max_parallel_ssh: number;
  structured_logs_enabled: boolean;
};

/** Safe diagnostics for `/api/health` — no secret values. */
export function collectorRuntimeHealth(): CollectorRuntimeHealth {
  const hasHosts = collectorHasHostSlots();
  const credOk = credentialSourceConfigured();
  return {
    configured: hasHosts && credOk,
    host_slots: collectorHostSlotCount(),
    has_host_slots: hasHosts,
    credential_source_ready: credOk,
    secret_provider: activeSecretProviderMode(),
    max_parallel_ssh: collectorMaxParallelSsh(),
    structured_logs_enabled: collectorStructuredLoggingEnabled(),
  };
}
