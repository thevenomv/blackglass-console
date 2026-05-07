export const dynamic = "force-dynamic";

import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { OperatorHealthReadout } from "./_components/OperatorHealthReadout";
import { SettingsRotateRow } from "./_components/SettingsRotateRow";
import { WebhookSection } from "./_components/WebhookSection";
import { CollectorHostsSection } from "./_components/CollectorHostsSection";
import { SampleDataSection } from "./_components/SampleDataSection";
import { IntegrationsSection } from "./_components/IntegrationsSection";
import { collectorConfigured } from "@/lib/server/collector";
import { EgressIpSection } from "./_components/EgressIpSection";
import { AutoScanSection } from "./_components/AutoScanSection";
import { PoliciesSection } from "./_components/PoliciesSection";
import { ApiKeysSection } from "./_components/ApiKeysSection";
import { RuntimeHealthSection } from "./_components/RuntimeHealthSection";
import { WebhookDeliveryLog } from "./_components/WebhookDeliveryLog";
import { WebhookSigningKeySection } from "./_components/WebhookSigningKeySection";
import { ThemeToggleSection } from "./_components/ThemeToggleSection";
import { SsoSection } from "./_components/SsoSection";
import { ScimSection } from "./_components/ScimSection";
import { AirgapSection } from "./_components/AirgapSection";
import { airgapStatus } from "@/lib/server/airgap";
import { RetentionSection } from "./_components/RetentionSection";
import { DataExportSection } from "./_components/DataExportSection";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { Button } from "@/components/ui/Button";
import { getLimits } from "@/lib/plan";

export default async function SettingsPage() {
  const limits = getLimits();

  let role: string | null = null;
  if (isClerkAuthEnabled()) {
    try {
      const ctx = await requireTenantAuth();
      if (ctx.role === "guest_auditor") {
        redirect("/reports");
      }
      role = ctx.role;
    } catch (e) {
      if (e instanceof SaasAuthError && e.status === 400) {
        redirect("/select-workspace");
      }
    }
  } else {
    // Legacy single-tenant deployments — show the runtime health panel to
    // anyone who lands on /settings; the underlying /api/admin/* endpoints
    // still gate by role.
    role = "admin";
  }
  const showRuntimeHealth = role === "owner" || role === "admin";

  return (
    <AppShell>
      <div className="flex max-w-2xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Settings"
          subtitle="Collector credentials, outbound webhooks, and workspace guardrails."
        />

        <OperatorHealthReadout />

        <SampleDataSection collectorConfigured={collectorConfigured()} />

        <CollectorHostsSection />

        <EgressIpSection
          egressIps={process.env.COLLECTOR_EGRESS_IPS ?? ""}
          nextEgressIps={process.env.COLLECTOR_EGRESS_IPS_NEXT ?? ""}
          rotatesAt={process.env.COLLECTOR_EGRESS_IPS_ROTATES_AT ?? ""}
        />

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Push ingest API key</h2>
          <SettingsRotateRow />
          <div className="flex items-center gap-3 pt-1">
            <a
              href="/api/v1/ingest/agent"
              download="blackglass-agent.sh"
              className="inline-flex h-8 items-center gap-1.5 rounded-card border border-border-default bg-bg-panel px-3 text-xs font-medium text-fg-primary transition-colors hover:bg-bg-elevated"
            >
              Download push agent (blackglass-agent.sh)
            </a>
          </div>
        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg-primary">Webhook</h2>
            {!limits.webhooks && <UpgradePrompt feature="" compact />}
          </div>
          <p className="text-sm text-fg-muted">
            POST compressed drift summaries with severity thresholds per route.
          </p>
          {limits.webhooks ? (
            <>
              <WebhookSection />
              {showRuntimeHealth ? (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                    Recent delivery log
                  </h3>
                  <WebhookDeliveryLog />
                </div>
              ) : null}
            </>
          ) : (
            <UpgradePrompt
              feature="Webhooks require BLACKGLASS Team"
              description="Deliver real-time drift summaries to Slack, PagerDuty, or any HTTP endpoint. Available on Pro and above."
            />
          )}
        </section>

        {limits.webhooks ? <IntegrationsSection /> : null}

        {limits.webhooks ? <WebhookSigningKeySection /> : null}

        {isClerkAuthEnabled() ? <SsoSection /> : null}
        {isClerkAuthEnabled() ? <ScimSection /> : null}
        <AirgapSection status={airgapStatus()} />

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Automated scans</h2>
          <p className="text-sm text-fg-muted">
            Schedule recurring fleet-wide drift scans without manual triggers.
          </p>
          {limits.scheduledScans ? (
            <AutoScanSection />
          ) : (
            <UpgradePrompt
              feature="Scheduled scans require BLACKGLASS Team"
              description="Run automatic drift sweeps on a configurable interval. Available on Pro and above."
            />
          )}
        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Policy rules</h2>
          <p className="text-sm text-fg-muted">
            Define &ldquo;must stay true&rdquo; invariants. Violations surface as high-priority drift events.
          </p>
          <PoliciesSection />
        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">API keys</h2>
          <p className="text-sm text-fg-muted">
            Generate long-lived Bearer tokens for CI/CD pipelines to trigger scans programmatically.
          </p>
          {limits.apiAccess ? (
            <ApiKeysSection />
          ) : (
            <UpgradePrompt
              feature="API key access requires BLACKGLASS Pro"
              description="Integrate drift scans directly into your deployment pipelines. Available on Pro and above."
            />
          )}
        </section>

        {showRuntimeHealth ? (
          <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
            <h2 className="text-sm font-semibold text-fg-primary">Runtime health</h2>
            <p className="text-sm text-fg-muted">
              Live rate-limit bucket sizes and BullMQ queue depth — same data the
              ops alerts use.
            </p>
            <RuntimeHealthSection />
          </section>
        ) : null}

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Data retention</h2>
          <p className="text-sm text-fg-muted">
            Configure how long each long-tail data class is kept before the
            nightly retention worker prunes it. Rotating collector credentials
            or signing out does not delete historical telemetry — only this
            policy does.
          </p>
          <RetentionSection />
        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Data export</h2>
          <p className="text-sm text-fg-muted">
            Generate a downloadable archive of all evidence, audit, drift, and
            host inventory for this workspace. The archive is delivered as a
            signed URL emailed to you when the job completes.
          </p>
          <DataExportSection />
        </section>

        <ThemeToggleSection />

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Session</h2>
          <p className="text-sm text-fg-muted">
            Sign out to end your current session.
          </p>
          <form action={signOut}>
            <Button variant="secondary" type="submit">
              Sign out
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
