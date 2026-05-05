export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { listMembershipsForTenant } from "@/lib/saas/tenant-service";
import { getSeatUsage } from "@/lib/saas/seats";
import { hasPermission } from "@/lib/saas/permissions";
import { isTrialReadOnlyState } from "@/lib/saas/trial";
import { loadHosts } from "@/lib/server/inventory";
import { BillingPortalButton } from "@/components/saas/BillingPortalButton";

export default async function BillingSettingsPage() {
  if (!isClerkAuthEnabled()) {
    redirect("/settings");
  }
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let ctx;
  try {
    ctx = await requireTenantAuth();
  } catch (e) {
    if (e instanceof SaasAuthError && e.status === 400) {
      redirect("/select-workspace");
    }
    redirect("/sign-in");
  }

  if (!hasPermission(ctx.role, "billing.manage")) {
    return (
      <AppShell>
        <div className="px-6 py-12 text-sm text-fg-muted">You do not have access to billing.</div>
      </AppShell>
    );
  }

  const memberships = await listMembershipsForTenant(ctx.tenant.id);
  const seatUsage = getSeatUsage(memberships, ctx.subscription.paidSeatLimit);
  const trialRo = isTrialReadOnlyState(ctx.subscription);
  const hostRows = await loadHosts();
  const hostCount = hostRows.length;
  const hostLimit = ctx.subscription.hostLimit;
  const stripeCustomer = ctx.subscription.stripeCustomerId;
  const stripeCustomerDisplay =
    stripeCustomer && stripeCustomer.length > 8
      ? `${stripeCustomer.slice(0, 4)}…${stripeCustomer.slice(-4)}`
      : stripeCustomer ?? "—";
  const enterpriseLike =
    ctx.subscription.planCode === "enterprise" || ctx.subscription.status === "custom";

  return (
    <AppShell>
      <div className="flex max-w-3xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Plan & billing"
          subtitle="Commercial plans bill on host volume and paid operator seats — viewers are unlimited."
        />

        {trialRo ? (
          <div className="rounded-card border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            Trial has ended. The workspace remains available for read-only visibility; upgrade via
            Stripe (or contact sales for Enterprise) to restore operational features.
          </div>
        ) : null}

        {enterpriseLike ? (
          <div className="rounded-card border border-accent-blue/40 bg-accent-blue/10 p-4 text-sm text-fg-primary">
            Enterprise / custom billing terms apply to this workspace. Seat and host envelopes are
            negotiated out-of-band — contact your account team for changes to entitlements.
          </div>
        ) : null}

        <section className="rounded-card border border-border-default bg-bg-panel p-5 text-sm">
          <h2 className="font-semibold text-fg-primary">Current subscription</h2>
          <dl className="mt-3 space-y-2 text-fg-muted">
            <div className="flex justify-between gap-4">
              <dt>Plan</dt>
              <dd className="text-fg-primary">{ctx.subscription.planCode}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Status</dt>
              <dd className="text-fg-primary">{ctx.subscription.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Stripe customer (synced)</dt>
              <dd className="font-mono text-fg-primary">{stripeCustomerDisplay}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Hosts in inventory</dt>
              <dd className="text-fg-primary">
                {hostCount}
                {hostLimit >= 0 ? ` / ${hostLimit}` : ""}
                {hostLimit >= 0 && hostCount >= hostLimit ? (
                  <span className="ml-2 text-amber-300">(at allowance)</span>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Host allowance</dt>
              <dd className="text-fg-primary">
                {ctx.subscription.hostLimit < 0 ? "Custom / unlimited" : ctx.subscription.hostLimit}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Paid seats included</dt>
              <dd className="text-fg-primary">
                {ctx.subscription.paidSeatLimit < 0
                  ? "Custom"
                  : ctx.subscription.paidSeatLimit}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Paid seats in use</dt>
              <dd className="text-fg-primary">
                {seatUsage.paidSeatsUsed} (viewers & guest auditors excluded)
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Viewers</dt>
              <dd className="text-fg-primary">Unlimited on all paid plans</dd>
            </div>
            {ctx.subscription.trialEndsAt ? (
              <div className="flex justify-between gap-4">
                <dt>Trial ends</dt>
                <dd className="text-fg-primary">{ctx.subscription.trialEndsAt.toISOString()}</dd>
              </div>
            ) : null}
          </dl>
          {ctx.subscription.stripeCustomerId ? (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <p className="mb-2 text-xs font-medium text-fg-muted">Customer portal</p>
              <BillingPortalButton customerId={ctx.subscription.stripeCustomerId} />
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
