import Link from "next/link";

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
  footer: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  highlightLabel?: string;
  ctaVariant: "primary" | "secondary";
}

// ---------------------------------------------------------------------------
// Data — matches the exact copy spec
// ---------------------------------------------------------------------------

const TIERS: PricingTier[] = [
  {
    key: "free",
    label: "Blackglass Local",
    price: "$0",
    priceSub: "/ month",
    tagline: "For individual admins, homelab, and small side projects.",
    bullets: [
      "Up to 3 Linux hosts",
      "Manual scans on demand",
      "Baseline capture and drift detection",
      "Host detail and investigation views",
      "30 days of drift history",
      "Single user, local workspace",
      "Basic evidence export (per host)",
    ],
    footer:
      "Prove that Blackglass works on your own machines before you spend a penny.",
    cta: "Get started free",
    ctaHref: "/onboarding",
    highlight: false,
    ctaVariant: "secondary",
  },
  {
    key: "pro",
    label: "Blackglass Team",
    price: "From $29",
    priceSub: "/ month",
    tagline:
      "For small infra and security teams that need automation and evidence.",
    bullets: [
      "Up to 25 hosts",
      "Up to 5 users",
      "Scheduled scans (hourly / daily policies)",
      "Fleet dashboard with alerts for high‑risk drift",
      "Evidence bundles with notes and tags",
      "Webhook, email, and Slack notifications",
      "180 days of drift history",
      "API access for pulling drift and evidence data",
      "Priority email support",
    ],
    footer:
      "Run Blackglass across your real estate, investigate drift together, and export clean evidence for incidents and audits.",
    cta: "Start Team plan",
    ctaHref: "mailto:hello@blackglass.io?subject=Blackglass+Team+Plan",
    highlight: true,
    highlightLabel: "Most popular",
    ctaVariant: "primary",
  },
  {
    key: "enterprise",
    label: "Blackglass Fleet",
    price: "Talk to us",
    tagline:
      "For organizations that need governance, compliance and support at scale.",
    bullets: [
      "50+ hosts (hundreds or thousands on request)",
      "Unlimited or large user seats",
      "SSO (SAML / OIDC) and granular RBAC",
      "Long‑term drift history and immutable audit logs",
      "Host groups, environments, and baseline approval workflows",
      "Custom evidence and reporting templates",
      "Option for dedicated collectors and private Vault integration",
      "Named customer success and onboarding",
      "Support SLAs",
    ],
    footer:
      "Standardize Linux integrity across your fleet with the controls and evidence your auditors expect.",
    cta: "Contact sales",
    ctaHref: "mailto:hello@blackglass.io?subject=Blackglass+Fleet+Enquiry",
    highlight: false,
    ctaVariant: "secondary",
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
      {/* "Most popular" badge */}
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
          <span className="text-3xl font-bold tracking-tight text-fg-primary">
            {tier.price}
          </span>
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

      {/* Footer note */}
      <p className="mt-6 text-xs italic leading-relaxed text-fg-faint">{tier.footer}</p>

      {/* CTA */}
      <div className="mt-6">
        {tier.ctaVariant === "primary" ? (
          <a
            href={tier.ctaHref}
            className="block w-full rounded-card bg-accent-blue py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            {tier.cta}
          </a>
        ) : tier.ctaHref.startsWith("mailto:") ? (
          <a
            href={tier.ctaHref}
            className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            {tier.cta}
          </a>
        ) : (
          <Link
            href={tier.ctaHref}
            className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            {tier.cta}
          </Link>
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
      <div className="mx-auto max-w-6xl">

        {/* Eyebrow */}
        <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          Pricing
        </p>

        {/* Headline */}
        <h2
          id="pricing-heading"
          className="mt-3 text-center text-4xl font-bold tracking-tight text-fg-primary sm:text-5xl"
        >
          Choose your scale of integrity
        </h2>

        {/* Subheadline */}
        <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-fg-muted">
          Blackglass is free for personal and small‑lab use. Pay only when you
          need to protect a real fleet and collaborate as a team.
        </p>

        {/* Cards grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-1 lg:grid-cols-3 lg:items-start">
          {TIERS.map((tier) => (
            <TierCard key={tier.key} tier={tier} />
          ))}
        </div>

        {/* Bottom principle note */}
        <div className="mt-12 rounded-card border border-border-subtle bg-bg-panel px-8 py-5 text-center">
          <p className="text-sm font-medium text-fg-primary">
            The core integrity workflow is always free
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Baseline capture, drift detection, manual scans, investigation, and
            per‑host evidence export are never paywalled for small deployments.
            Paid plans are about scale, automation, and team governance.
          </p>
        </div>

      </div>
    </section>
  );
}
