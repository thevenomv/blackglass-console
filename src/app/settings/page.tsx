import { signOut } from "@/app/(auth)/login/actions";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { OperatorHealthReadout } from "@/components/settings/OperatorHealthReadout";
import { SettingsRotateRow } from "@/components/settings/SettingsRotateRow";
import { WebhookSection } from "@/components/settings/WebhookSection";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { Button } from "@/components/ui/Button";
import { getLimits } from "@/lib/plan";

export default function SettingsPage() {
  const limits = getLimits();

  return (
    <AppShell>
      <div className="flex max-w-2xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Settings"
          subtitle="Collector credentials, outbound webhooks, and workspace guardrails."
        />

        <OperatorHealthReadout />

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Collector API key</h2>
          <p className="text-sm text-fg-muted">
            Rotate keys on a schedule — scopes limit ingestion to integrity payloads only.
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
