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

        <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Collector hosts (SSH pull)</h2>
          <p className="text-sm text-fg-muted">
            Set these environment variables in your deployment (DigitalOcean App Platform → Settings → Environment
            Variables, or via Doppler / your secrets manager), then redeploy.
          </p>
          <div className="rounded-card border border-border-subtle bg-bg-base px-4 py-3 font-mono text-xs leading-relaxed text-fg-muted space-y-1">
            <p><span className="text-fg-primary">COLLECTOR_HOST_1</span>=<span className="text-accent-blue">167.172.224.47</span> <span className="text-fg-faint"># IP or hostname of the target</span></p>
            <p><span className="text-fg-primary">COLLECTOR_NAME_1</span>=<span className="text-accent-blue">prod-01</span> <span className="text-fg-faint"># optional display name</span></p>
            <p><span className="text-fg-primary">COLLECTOR_USER</span>=<span className="text-accent-blue">collector</span> <span className="text-fg-faint"># SSH user on the target (default: collector)</span></p>
            <p><span className="text-fg-primary">SSH_PRIVATE_KEY</span>=<span className="text-accent-blue">-----BEGIN OPENSSH PRIVATE KEY-----…</span> <span className="text-fg-faint"># PEM — store as secret</span></p>
            <p className="text-fg-faint pt-1"># Add _2, _3 … suffixes for additional hosts. SSH_PORT overrides the port (default 22).</p>
          </div>
          <p className="text-xs text-fg-faint">
            After setting these vars and redeploying, <span className="font-mono">GET /api/v1/hosts</span> will return your fleet.
            The Runtime health panel above confirms the adapter is live.
          </p>
        </section>

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
