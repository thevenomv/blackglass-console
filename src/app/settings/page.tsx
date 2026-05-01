import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsRotateRow } from "@/components/settings/SettingsRotateRow";
import { WebhookSection } from "@/components/settings/WebhookSection";
import { Button } from "@/components/ui/Button";
export default function SettingsPage() {
  return (
    <AppShell>
      <div className="flex max-w-2xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Settings"
          subtitle="Collector credentials, outbound webhooks, and workspace guardrails."
        />

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Collector API key</h2>
          <p className="text-sm text-fg-muted">
            Rotate keys on a schedule — scopes limit ingestion to integrity payloads only.
          </p>
          <SettingsRotateRow />        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Webhook</h2>
          <p className="text-sm text-fg-muted">
            POST compressed drift summaries with severity thresholds per route.
          </p>
          <WebhookSection />
        </section>

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Session</h2>
          <p className="text-sm text-fg-muted">
            When <span className="font-mono text-fg-primary">AUTH_REQUIRED=true</span>, operators
            must authenticate before accessing the console.
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
