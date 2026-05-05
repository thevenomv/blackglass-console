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

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Push ingest API key</h2>
          <p className="text-sm text-fg-muted">
            Bearer token for <span className="font-mono text-xs">POST /api/v1/ingest</span> — rotate when staff change
            or on your security schedule.
          </p>
          <SettingsRotateRow />
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
