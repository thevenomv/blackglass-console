import Link from "next/link";
import { PLAN_LIMITS } from "@/lib/plan";

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const enterprise = PLAN_LIMITS.enterprise;

function Check() {
  return <span className="text-accent-green">✓</span>;
}
function Cross() {
  return <span className="text-fg-faint">–</span>;
}

function Feature({ included, label }: { included: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg-muted">
      {included ? <Check /> : <Cross />}
      <span className={included ? "text-fg-primary" : "text-fg-faint"}>{label}</span>
    </li>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg-base px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <p className="text-center font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
          Pricing
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold text-fg-primary">
          Operational integrity at every scale
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-fg-muted">
          Free for small labs and personal use. Paid plans unlock fleet operations,
          team collaboration, and compliance workflows.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Free */}
          <div className="flex flex-col rounded-card border border-border-default bg-bg-panel p-6">
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-fg-faint">
              {free.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-fg-primary">Free</p>
            <p className="mt-1 text-sm text-fg-muted">Forever. No credit card.</p>
            <ul className="mt-6 flex flex-col gap-3">
              <Feature included label={`Up to ${free.maxHosts} hosts`} />
              <Feature included label="Baseline + drift view" />
              <Feature included label="Manual scans" />
              <Feature included label="Evidence export" />
              <Feature included={false} label="Scheduled scans" />
              <Feature included={false} label="Multi-user access" />
              <Feature included={false} label="Webhooks" />
              <Feature included={false} label="Audit log export" />
              <Feature included={false} label="SSO / SAML" />
            </ul>
            <div className="mt-auto pt-8">
              <Link
                href="/onboarding"
                className="block w-full rounded-card border border-border-default bg-bg-elevated py-2 text-center text-sm font-medium text-fg-primary transition-colors hover:bg-bg-panel"
              >
                Get started free
              </Link>
            </div>
          </div>

          {/* Pro */}
          <div className="flex flex-col rounded-card border border-accent-blue bg-bg-panel p-6 shadow-elevated">
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent-blue">
              {pro.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-fg-primary">
              £49<span className="text-base font-normal text-fg-muted">/mo</span>
            </p>
            <p className="mt-1 text-sm text-fg-muted">Up to {pro.maxHosts} hosts. Flat rate.</p>
            <ul className="mt-6 flex flex-col gap-3">
              <Feature included label={`Up to ${pro.maxHosts} hosts`} />
              <Feature included label="Baseline + drift view" />
              <Feature included label="Scheduled scans" />
              <Feature included label="Evidence bundles + reports" />
              <Feature included label="Multi-user access" />
              <Feature included label="Webhooks + email alerts" />
              <Feature included label="Audit log export" />
              <Feature included label="API access" />
              <Feature included={false} label="SSO / SAML" />
            </ul>
            <div className="mt-auto pt-8">
              <a
                href="mailto:hello@blackglass.io?subject=Blackglass Team"
                className="block w-full rounded-card bg-accent-blue py-2 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Get in touch
              </a>
            </div>
          </div>

          {/* Enterprise */}
          <div className="flex flex-col rounded-card border border-border-default bg-bg-panel p-6">
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-fg-faint">
              {enterprise.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-fg-primary">Custom</p>
            <p className="mt-1 text-sm text-fg-muted">50+ hosts. Talk to us.</p>
            <ul className="mt-6 flex flex-col gap-3">
              <Feature included label="Unlimited hosts" />
              <Feature included label="Everything in Team" />
              <Feature included label="SSO / SAML" />
              <Feature included label="Dedicated collector support" />
              <Feature included label="Vault / OIDC credential integration" />
              <Feature included label="Retention policy + compliance controls" />
              <Feature included label="Priority support + SLO" />
            </ul>
            <div className="mt-auto pt-8">
              <a
                href="mailto:hello@blackglass.io?subject=Blackglass Fleet"
                className="block w-full rounded-card border border-border-default bg-bg-elevated py-2 text-center text-sm font-medium text-fg-primary transition-colors hover:bg-bg-panel"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>

        {/* Principle callout */}
        <div className="mt-16 rounded-card border border-border-subtle bg-bg-panel px-8 py-6 text-center">
          <p className="text-sm font-medium text-fg-primary">
            The core integrity workflow is always free
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Baseline creation, drift detection, manual scans, and investigation are never paywalled
            for small deployments. Paid plans are about scale, automation, and team governance —
            not access to basic security information.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm font-medium text-accent-blue hover:underline">
            Back to console
          </Link>
        </div>
      </div>
    </div>
  );
}
