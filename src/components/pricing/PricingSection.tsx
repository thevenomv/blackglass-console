import Link from "next/link";
import CheckoutButton from "./CheckoutButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingTier {
  key: string;
  label: string;
  price: string;
  priceSub?: string;
  tagline: string;
  bullets: string[];
  overageNote?: string;
  cta: string;
  planCode?: string;
  ctaHref?: string;
  highlight?: boolean;
  highlightLabel?: string;
  ctaVariant: "primary" | "secondary" | "enterprise";
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TIERS: PricingTier[] = [
  {
    key: "starter",
    label: "Starter",
    price: "$79",
    priceSub: "/ month",
    tagline: "For small infra teams protecting a real estate and needing audit-ready evidence.",
    bullets: [
      "25 Linux hosts under management",
      "2 operator / admin seats",
      "Unlimited read-only viewers",
      "Scheduled scans (hourly / daily policies)",
      "Baseline capture and drift detection",
      "Evidence bundles with notes and tags",
      "Webhook, email, and Slack notifications",
      "180 days of drift history",
      "API access for pulling drift and evidence data",
    ],
    overageNote: "+$2 / extra host Â· +$15 / extra operator seat",
    cta: "Start Starter plan",
    planCode: "starter",
    highlight: false,
    ctaVariant: "secondary",
  },
  {
    key: "growth",
    label: "Growth",
    price: "$199",
    priceSub: "/ month",
    tagline: "For growing security and ops teams that need fleet-wide visibility and governance.",
    bullets: [
      "100 Linux hosts under management",
      "5 operator / admin seats",
      "Unlimited read-only viewers",
      "Everything in Starter",
      "Fleet dashboard with risk-scoring and alerts",
      "Audit log with full export",
      "Custom evidence and reporting templates",
      "Priority email support",
    ],
    overageNote: "+$1.50 / extra host Â· +$20 / extra operator seat",
    cta: "Start Growth plan",
    planCode: "growth",
    highlight: true,
    highlightLabel: "Most popular",
    ctaVariant: "primary",
  },
  {
    key: "business",
    label: "Business",
    price: "$499",
    priceSub: "/ month",
    tagline: "For larger teams that need environment segmentation and compliance controls.",
    bullets: [
      "300 Linux hosts under management",
      "10 operator / admin seats",
      "Unlimited read-only viewers",
      "Everything in Growth",
      "Host groups and environments",
      "Baseline approval workflows",
      "Volume pricing for additional hosts",
    ],
    overageNote: "+$25 / extra operator seat Â· additional hosts by volume",
    cta: "Start Business plan",
    planCode: "business",
    highlight: false,
    ctaVariant: "secondary",
  },
  {
    key: "enterprise",
    label: "Enterprise",
    price: "Custom",
    tagline: "For organisations that need governance, compliance, and support at scale.",
    bullets: [
      "300+ hosts (hundreds or thousands)",
      "Custom operator / admin seats",
      "Unlimited read-only viewers",
      "SSO (SAML / OIDC) and granular RBAC",
      "Custom data residency and retention",
      "Immutable audit logs",
      "Named customer success and onboarding",
      "Support SLAs",
    ],
    cta: "Contact sales",
    ctaHref: "mailto:jamie@obsidiandynamics.co.uk?subject=BLACKGLASS+Enterprise+Enquiry",
    highlight: false,
    ctaVariant: "enterprise",
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`mt-0.5 h-4 w-4 shrink-0 ${muted ? "text-fg-muted" : "text-success-DEFAULT"}`}
      fill="none"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
    </svg>
  );
}

function BulletList({ items, muted = false }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="flex flex-col gap-2.5" role="list">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm">
          <CheckIcon muted={muted} />
          <span className={muted ? "text-fg-muted" : "text-fg-primary"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TierCard({ tier }: { tier: PricingTier }) {
  const isHighlighted = tier.highlight;

  const cardClasses = isHighlighted
    ? "relative flex flex-col rounded-card border-2 border-accent-blue bg-bg-panel p-7 shadow-elevated"
    : "relative flex flex-col rounded-card border border-border-default bg-bg-panel p-7";

  const labelClasses = isHighlighted
    ? "font-mono text-[11px] font-medium uppercase tracking-widest text-accent-blue"
    : "font-mono text-[11px] font-medium uppercase tracking-widest text-fg-faint";

  return (
    <div className={cardClasses}>
      {isHighlighted && tier.highlightLabel && (
        <div
          aria-label={`${tier.highlightLabel} plan`}
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-blue px-3.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-white"
        >
          {tier.highlightLabel}
        </div>
      )}

      {/* Header */}
      <div>
        <p className={labelClasses}>{tier.label}</p>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight text-fg-primary">{tier.price}</span>
          {tier.priceSub && (
            <span className="text-sm font-normal text-fg-muted">{tier.priceSub}</span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{tier.tagline}</p>
      </div>

      {/* Divider */}
      <div className="my-6 h-px bg-border-subtle" aria-hidden="true" />

      {/* Features */}
      <div className="flex-1">
        <BulletList items={tier.bullets} muted={!isHighlighted} />
      </div>

      {/* Overage note */}
      {tier.overageNote && (
        <p className="mt-5 text-xs text-fg-faint">{tier.overageNote}</p>
      )}

      {/* CTA */}
      <div className="mt-6">
        {tier.ctaVariant === "primary" && tier.planCode ? (
          <CheckoutButton
            planCode={tier.planCode}
            className="block w-full cursor-pointer rounded-card bg-accent-blue py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:opacity-60"
          >
            {tier.cta}
          </CheckoutButton>
        ) : tier.ctaVariant === "secondary" && tier.planCode ? (
          <CheckoutButton
            planCode={tier.planCode}
            className="block w-full cursor-pointer rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:opacity-60"
          >
            {tier.cta}
          </CheckoutButton>
        ) : (
          <a
            href={tier.ctaHref}
            className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            {tier.cta}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function PricingSection() {
  return (
    <section
      aria-labelledby="pricing-heading"
      className="w-full bg-bg-base px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">

        {/* Eyebrow */}
        <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          Pricing
        </p>

        {/* Headline */}
        <h2
          id="pricing-heading"
          className="mt-3 text-center text-4xl font-bold tracking-tight text-fg-primary sm:text-5xl"
        >
          Scale with your fleet
        </h2>

        {/* Subheadline */}
        <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-fg-muted">
          Per-host pricing that tracks infrastructure size â€” not seat count.
          Operators and admins count; read-only viewers never do.
        </p>

        {/* Trial callout */}
        <div className="mx-auto mt-8 max-w-2xl rounded-card border border-border-subtle bg-bg-panel px-6 py-4 text-center">
          <p className="text-sm font-medium text-fg-primary">
            Every plan starts with a 14-day free trial
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Up to 10 hosts, 2 operator seats, and unlimited viewers â€” no credit card required.
            After the trial, choose a plan to continue. If you don&apos;t, your workspace becomes
            read-only: no new scans, hosts, baselines, or secrets.
          </p>
        </div>

        {/* Annual discount teaser */}
        <p className="mt-4 text-center text-xs text-fg-faint">
          Annual billing available â€” approximately two months free. Contact us to switch.
        </p>

        {/* Cards grid â€” 4 columns at lg */}
        <div className="mt-12 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {TIERS.map((tier) => (
            <TierCard key={tier.key} tier={tier} />
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-12 rounded-card border border-border-subtle bg-bg-panel px-8 py-5 text-center">
          <p className="text-sm font-medium text-fg-primary">
            Viewers are always free, on every plan
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Team members with read-only access â€” investigations, drift history, evidence review â€”
            never consume a paid seat. Only operators and admins who can run scans, modify
            baselines, or manage secrets count toward your seat limit.
          </p>
        </div>

        {/* Legal footer */}
        <p className="mt-8 text-center text-xs text-fg-faint">
          BLACKGLASS is a product of{" "}
          <a href="https://obsidiandynamics.co.uk" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
            Obsidian Dynamics Limited
          </a>
          {" "}(Co. No. 16663833, England &amp; Wales).{" "}Questions?{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          {" "}Â·{" "}
          <a href="/terms" className="text-accent-blue hover:underline">Terms</a>
          {" "}Â·{" "}
          <a href="/privacy" className="text-accent-blue hover:underline">Privacy</a>
        </p>

      </div>
    </section>
  );
}
