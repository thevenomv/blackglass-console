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
import { EgressIpSection } from "./_components/EgressIpSection";
import { AutoScanSection } from "./_components/AutoScanSection";
import { PoliciesSection } from "./_components/PoliciesSection";
import { ApiKeysSection } from "./_components/ApiKeysSection";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { Button } from "@/components/ui/Button";
import { getLimits } from "@/lib/plan";

export default async function SettingsPage() {
  const limits = getLimits();

  if (isClerkAuthEnabled()) {
    try {
      const ctx = await requireTenantAuth();
      if (ctx.role === "guest_auditor") {
        redirect("/reports");
      }
    } catch (e) {
      if (e instanceof SaasAuthError && e.status === 400) {
        redirect("/select-workspace");
      }
    }
  }

  return (
    <AppShell>
      <div className="flex max-w-2xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Settings"
          subtitle="Collector credentials, outbound webhooks, and workspace guardrails."
        />

        <OperatorHealthReadout />

        <CollectorHostsSection />

        <EgressIpSection egressIps={process.env.COLLECTOR_EGRESS_IPS ?? ""} />

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
            <WebhookSection />
          ) : (
            <UpgradePrompt
              feature="Webhooks require BLACKGLASS Team"
              description="Deliver real-time drift summaries to Slack, PagerDuty, or any HTTP endpoint. Available on Pro and above."
            />
          )}
        </section>

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

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Data retention</h2>
          <p className="text-sm text-fg-muted">
            Baseline snapshots, drift events, and audit exports follow your plan&apos;s retention window.
            Rotating collector credentials or signing out does not delete historical telemetry — use workspace
            controls or support for governed deletion where your policy requires it.
          </p>
        </section>

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
