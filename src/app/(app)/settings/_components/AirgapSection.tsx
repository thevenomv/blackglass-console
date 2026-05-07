"use client";

/**
 * Read-only Settings card surfacing the air-gapped install mode.
 * Renders nothing when BLACKGLASS_AIRGAPPED is not set, so the card
 * is invisible to the 99% of deployments that are not air-gapped.
 *
 * The status object is computed server-side and passed in as a prop
 * (server -> client) rather than fetched, because the air-gap flag
 * is set at boot and never changes during the process lifetime.
 */

interface AirgapStatus {
  enabled: boolean;
  whitelistedHostPatterns: string[];
}

export function AirgapSection({ status }: { status: AirgapStatus | null }) {
  if (!status?.enabled) return null;

  return (
    <section className="space-y-3 rounded-card border border-warning/40 bg-warning-soft/15 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-warning">
          Air-gapped mode
        </p>
        <h2 className="mt-1 text-sm font-semibold text-fg-primary">
          Outbound integrations are disabled
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <code className="font-mono text-[11px]">BLACKGLASS_AIRGAPPED=true</code>{" "}
          is set on this deployment. Outbound calls to third-party SaaS
          (Slack, PagerDuty, Datadog, OpenAI, Resend) are skipped at
          dispatch time so they never time out against your egress
          firewall.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
          Outbound call destinations still allowed
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Calls whose hostname matches one of these patterns are
          treated as internal and dispatched normally — use these for
          your local Sentry mirror, your local PagerDuty proxy, an
          internal SMTP relay, the remediator running on the cluster
          network, etc.
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-fg-primary">
          {status.whitelistedHostPatterns.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-xs text-fg-muted">
        <p className="font-medium text-fg-primary">Operator note</p>
        <p className="mt-1">
          Inbound webhooks (Stripe, Clerk) are unaffected — the air-gap
          only applies to outbound calls. The OpenTelemetry OTLP
          exporter is left active on the assumption that{" "}
          <code className="font-mono">OTEL_EXPORTER_OTLP_ENDPOINT</code>{" "}
          points at an internal collector.
        </p>
      </div>
    </section>
  );
}
