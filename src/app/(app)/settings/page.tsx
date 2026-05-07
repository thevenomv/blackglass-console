/**
 * /settings — workspace configuration page.
 *
 * The settings surface accumulated 19 sections over time and became a
 * scrollable wall. As of 2026-05-07 it's grouped into 6 tabs that map to
 * the operator's mental model:
 *
 *   workspace    — operational defaults (theme, sample data, sign out)
 *   collectors   — host inventory + ingest pipelines
 *   policies     — rules, schedules, retention guardrails
 *   notify       — outbound webhooks, integrations, signing keys
 *   identity     — SSO, SCIM, API keys, air-gap mode
 *   operator     — admin-only health + export tooling
 *
 * Tab state lives in the `?tab=<id>` URL parameter so links are
 * shareable and survive a refresh. SettingsTabs handles the SSR-correct
 * default + client-side switching.
 */

export const dynamic = "force-dynamic";

import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Suspense } from "react";
import { SettingsTabs, SettingsPanel, type SettingsTab } from "./_components/SettingsTabs";
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

function Card({
  title,
  description,
  upgradeBadge,
  children,
}: {
  title: string;
  description?: string;
  upgradeBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-fg-primary">{title}</h3>
          {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
        </div>
        {upgradeBadge}
      </div>
      <div className="space-y-3 pt-1">{children}</div>
    </section>
  );
}

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
    role = "admin";
  }
  const showOperator = role === "owner" || role === "admin";

  // Tab definitions. Hide the operator tab from non-admins entirely so it
  // doesn't even appear in the rail (vs. greying out — less noise, clearer).
  const tabs: SettingsTab[] = [
    { id: "workspace", label: "Workspace", icon: "⌘" },
    { id: "collectors", label: "Collectors & ingest", icon: "↘" },
    { id: "policies", label: "Policies & schedules", icon: "✓" },
    { id: "notify", label: "Notifications", icon: "✦" },
    { id: "identity", label: "Identity & access", icon: "◐" },
    ...(showOperator ? [{ id: "operator", label: "Operator", icon: "⚙" } as SettingsTab] : []),
  ];

  return (
    <AppShell>
      <div className="flex max-w-5xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Settings"
          subtitle="Workspace configuration, collectors, notifications, and access controls."
        />

        <Suspense fallback={null}>
          <SettingsTabs tabs={tabs} defaultTab="workspace">
            {/* WORKSPACE — first thing operators set up; quick wins live here. */}
            <SettingsPanel
              id="workspace"
              title="Workspace"
              description="Personal preferences and quick onboarding shortcuts."
            >
              <SampleDataSection collectorConfigured={collectorConfigured()} />
              <ThemeToggleSection />
              <Card
                title="Session"
                description="Sign out to end your current session."
              >
                <form action={signOut}>
                  <Button variant="secondary" type="submit">
                    Sign out
                  </Button>
                </form>
              </Card>
            </SettingsPanel>

            {/* COLLECTORS & INGEST — host inventory and the two ways data flows in. */}
            <SettingsPanel
              id="collectors"
              title="Collectors & ingest"
              description="The hosts Blackglass scans, the network paths it uses, and the credentials your CI agents present."
            >
              <CollectorHostsSection />
              <EgressIpSection
                egressIps={process.env.COLLECTOR_EGRESS_IPS ?? ""}
                nextEgressIps={process.env.COLLECTOR_EGRESS_IPS_NEXT ?? ""}
                rotatesAt={process.env.COLLECTOR_EGRESS_IPS_ROTATES_AT ?? ""}
              />
              <Card
                title="Push ingest API key"
                description="Long-lived bearer token your push agent presents when streaming snapshots from CI."
              >
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
              </Card>
            </SettingsPanel>

            {/* POLICIES & SCHEDULES — the rules layer. */}
            <SettingsPanel
              id="policies"
              title="Policies & schedules"
              description="Invariants Blackglass enforces, when scans run automatically, and how long evidence sticks around."
            >
              <Card
                title="Policy rules"
                description='Define "must stay true" invariants. Violations surface as high-priority drift events.'
              >
                <PoliciesSection />
              </Card>
              <Card
                title="Automated scans"
                description="Schedule recurring fleet-wide drift scans without manual triggers."
              >
                {limits.scheduledScans ? (
                  <AutoScanSection />
                ) : (
                  <UpgradePrompt
                    feature="Scheduled scans require BLACKGLASS Team"
                    description="Run automatic drift sweeps on a configurable interval. Available on Pro and above."
                  />
                )}
              </Card>
              <Card
                title="Data retention"
                description="How long each long-tail data class is kept before the nightly retention worker prunes it. Rotating credentials or signing out does not delete historical telemetry — only this policy does."
              >
                <RetentionSection />
              </Card>
            </SettingsPanel>

            {/* NOTIFICATIONS — outbound deliveries (webhooks, Slack/PagerDuty, etc.) */}
            <SettingsPanel
              id="notify"
              title="Notifications"
              description="Where Blackglass sends drift alerts and how recipients verify the payloads came from us."
            >
              <Card
                title="Webhooks"
                description="POST compressed drift summaries with severity thresholds per route."
                upgradeBadge={!limits.webhooks ? <UpgradePrompt feature="" compact /> : undefined}
              >
                {limits.webhooks ? (
                  <>
                    <WebhookSection />
                    {showOperator ? (
                      <div className="mt-4 border-t border-border-subtle pt-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                          Recent delivery log
                        </h4>
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
              </Card>
              {limits.webhooks ? <IntegrationsSection /> : null}
              {limits.webhooks ? <WebhookSigningKeySection /> : null}
            </SettingsPanel>

            {/* IDENTITY & ACCESS — auth, SSO, SCIM, API tokens, air-gap. */}
            <SettingsPanel
              id="identity"
              title="Identity & access"
              description="How users and machines authenticate to your workspace, plus deployment-mode controls."
            >
              {isClerkAuthEnabled() ? <SsoSection /> : null}
              {isClerkAuthEnabled() ? <ScimSection /> : null}
              <Card
                title="API keys"
                description="Long-lived Bearer tokens for CI/CD pipelines to trigger scans programmatically."
              >
                {limits.apiAccess ? (
                  <ApiKeysSection />
                ) : (
                  <UpgradePrompt
                    feature="API key access requires BLACKGLASS Pro"
                    description="Integrate drift scans directly into your deployment pipelines. Available on Pro and above."
                  />
                )}
              </Card>
              <AirgapSection status={airgapStatus()} />
            </SettingsPanel>

            {/* OPERATOR — admin-only ops tooling, hidden from non-admins. */}
            {showOperator ? (
              <SettingsPanel
                id="operator"
                title="Operator"
                description="Live system health and bulk evidence export. Visible only to owners and admins."
              >
                <OperatorHealthReadout />
                <Card
                  title="Runtime health"
                  description="Live rate-limit bucket sizes and BullMQ queue depth — same data the ops alerts use."
                >
                  <RuntimeHealthSection />
                </Card>
                <Card
                  title="Data export"
                  description="Generate a downloadable archive of all evidence, audit, drift, and host inventory for this workspace. The archive is delivered as a signed URL emailed to you when the job completes."
                >
                  <DataExportSection />
                </Card>
              </SettingsPanel>
            ) : null}
          </SettingsTabs>
        </Suspense>
      </div>
    </AppShell>
  );
}
