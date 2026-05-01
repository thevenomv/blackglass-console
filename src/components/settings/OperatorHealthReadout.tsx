import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorRuntimeHealth } from "@/lib/server/collector-runtime";

export function OperatorHealthReadout() {
  const c = collectorRuntimeHealth();
  const b = baselineStoreHealth();

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <h2 className="text-sm font-semibold text-fg-primary">Runtime health</h2>
      <p className="text-sm text-fg-muted">
        Same signals as <span className="font-mono text-fg-primary">GET /api/health</span> — no
        secrets shown.
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-fg-faint">Collector configured</dt>
          <dd className="font-medium text-fg-primary">{c.configured ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-fg-faint">Host slots</dt>
          <dd className="font-mono text-fg-primary">{c.host_slots}</dd>
        </div>
        <div>
          <dt className="text-fg-faint">Credential source</dt>
          <dd className="text-fg-primary">
            {c.credential_source_ready ? "Ready" : "Not ready"} ({c.secret_provider})
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Parallel SSH cap</dt>
          <dd className="font-mono text-fg-primary">{c.max_parallel_ssh}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-fg-faint">Baseline persistence</dt>
          <dd className="text-fg-primary">
            {!b.configured ? (
              "In-memory only (set BASELINE_STORE_PATH for disk)"
            ) : b.writable ? (
              <>
                Writable — <span className="font-mono text-sm">{b.path}</span>
              </>
            ) : (
              <>
                Not writable — <span className="font-mono text-sm">{b.path}</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
