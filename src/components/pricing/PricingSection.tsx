"use client";

import Link from "next/link";
import { useState } from "react";
import { ADD_ONS } from "@/lib/saas/plans";
import CheckoutButton from "./CheckoutButton";

type BillingCycle = "monthly" | "annual";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingTier {
  key: string;
  label: string;
  /** Monthly price in dollars (no currency / period suffix). Use null for "Custom". */
  monthlyUsd: number | null;
  /** When monthly is null, render this verbatim instead. */
  customLabel?: string;
  /** Optional "from $X / mo" anchor for sales-led tiers. */
  anchorUsd?: number;
  tagline: string;
  bullets: string[];
  overageNote?: string;
  cta: string;
  planCode?: string;
  ctaHref?: string;
  highlight?: boolean;
  highlightLabel?: string;
  ctaVariant: "primary" | "secondary" | "enterprise" | "ghost";
}

function formatPrice(monthlyUsd: number | null, cycle: BillingCycle): { price: string; sub: string } {
  if (monthlyUsd === null) return { price: "Custom", sub: "" };
  if (monthlyUsd === 0) return { price: "Free", sub: "forever" };
  if (cycle === "annual") {
    return { price: `$${monthlyUsd}`, sub: "/ mo billed annually" };
  }
  return { price: `$${monthlyUsd}`, sub: "/ month" };
}

// ---------------------------------------------------------------------------
// Data
//
// The ladder mirrors `src/lib/saas/plans.ts`. Lab is the perpetual free
// tier and renders as a slimmer card without a billing CTA. Team
// (introduced 2026-05-10) closes the previous Starter→Growth 5× cliff
// with a 25-host SMB landing pad. Scale fills the 100→300 host gap.
// Enterprise carries a published price anchor so procurement-savvy
// buyers don't bounce on the "Custom" wall.
// ---------------------------------------------------------------------------

const TIERS: PricingTier[] = [
  {
    key: "lab",
    label: "Lab",
    monthlyUsd: 0,
    tagline: "For homelabs, side projects, and teams kicking the tyres before paying.",
    bullets: [
      "5 Linux hosts under management",
      "1 operator seat",
      "Unlimited read-only viewers",
      "30 days of findings history",
      "Daily scheduled scan",
      "Read-only API access",
      "Charon: 1 linked cloud account (read-only inventory)",
      "Self-host or cloud — your call",
    ],
    cta: "Start free",
    ctaHref: "/sign-up?plan=lab",
    ctaVariant: "ghost",
  },
  {
    key: "starter",
    label: "Starter",
    monthlyUsd: 59,
    tagline: "For lean teams who want continuous visibility and exports leadership can read.",
    bullets: [
      "15 Linux hosts under management",
      "3 operator / admin seats",
      "Unlimited read-only viewers",
      "Scheduled scans up to 4× per host per day",
      "Baseline capture and change detection",
      "1 evidence bundle per month",
      "Webhook, email, and Slack notifications",
      "30 days of drift history · 90 days of audit log",
      "Read-only API access",
    ],
    overageNote: "+$4 / extra host · +$20 / extra operator seat · $5 / extra evidence bundle",
    cta: "Start Starter plan",
    planCode: "starter",
    ctaVariant: "secondary",
  },
  {
    key: "team",
    label: "Team",
    monthlyUsd: 89,
    tagline: "For growing SMB teams ready for hourly scans and full API — without jumping to Growth.",
    bullets: [
      "25 Linux hosts under management",
      "3 operator / admin seats",
      "Unlimited read-only viewers",
      "Hourly scheduled scans",
      "2 evidence bundles per month",
      "Webhook, email, and Slack notifications (3 endpoints)",
      "90 days of drift history · 180 days of audit log",
      "Full API access",
      "Charon: 10 linked cloud accounts",
    ],
    overageNote: "+$3 / extra host · +$22 / extra operator seat · $5 / extra evidence bundle",
    cta: "Start Team plan",
    planCode: "team",
    ctaVariant: "secondary",
  },
  {
    key: "growth",
    label: "Growth",
    monthlyUsd: 199,
    tagline: "For growing security and ops teams that need fleet-wide visibility and governance.",
    bullets: [
      "100 Linux hosts under management",
      "5 operator / admin seats",
      "Unlimited read-only viewers",
      "Hourly scheduled scans",
      "5 evidence bundles per month",
      "1 concurrent demo sandbox",
      "Audit log with full export",
      "Custom evidence and reporting templates",
      "180 days of drift history · 1 year of audit log",
      "Full API access",
      "Priority email support",
      "Remediator (HITL AI) available as $99/mo add-on",
    ],
    overageNote: "+$2 / extra host · +$25 / extra operator seat",
    cta: "Start Growth plan",
    planCode: "growth",
    highlight: true,
    highlightLabel: "Most popular",
    ctaVariant: "primary",
  },
  {
    key: "scale",
    label: "Scale",
    monthlyUsd: 349,
    tagline: "For teams crossing the 100-host line — environment segmentation without the Enterprise jump.",
    bullets: [
      "200 Linux hosts under management",
      "7 operator / admin seats",
      "Unlimited read-only viewers",
      "Scans every 30 min per host",
      "25 evidence bundles per month",
      "2 concurrent demo sandboxes",
      "Host groups and environments",
      "Baseline approval workflows",
      "1 year of drift history · 2 years of audit log",
      "Full API access",
      "Remediator (HITL AI) available as $99/mo add-on",
    ],
    overageNote: "+$1.50 / extra host · +$30 / extra operator seat",
    cta: "Start Scale plan",
    planCode: "scale",
    ctaVariant: "secondary",
  },
  {
    key: "business",
    label: "Business",
    monthlyUsd: 499,
    tagline: "For larger teams that need compliance controls, immutable audit, and remediation.",
    bullets: [
      "300 Linux hosts under management",
      "10 operator / admin seats",
      "Unlimited read-only viewers",
      "Scans every 15 min per host",
      "Unlimited evidence bundles",
      "3 concurrent demo sandboxes",
      "Immutable audit log",
      "Remediator (HITL AI) included",
      "Scheduled change-summary email (daily / weekly)",
      "1 year of drift history · 2 years of audit log",
      "Volume pricing for additional hosts",
    ],
    overageNote: "+$1 / extra host (volume) · +$35 / extra operator seat",
    cta: "Start Business plan",
    planCode: "business",
    ctaVariant: "secondary",
  },
  {
    key: "enterprise",
    label: "Enterprise",
    monthlyUsd: null,
    customLabel: "Custom",
    anchorUsd: 2500,
    tagline: "For organisations that need governance, compliance, and support at scale.",
    bullets: [
      "Unlimited hosts and operator seats",
      "SSO (SAML / OIDC) and granular RBAC",
      "Bring Your Own Key (AWS KMS / Vault Transit)",
      "Disconnected-network deployment (air-gapped)",
      "Custom data residency and retention (up to 7 years audit)",
      "Immutable audit logs and SOC 2 evidence pipeline",
      "Remediator (HITL AI) included with unlimited actions",
      "Self-hosted on your Kubernetes / VMs",
      "Named customer success and onboarding",
      "24×7 support SLA with Slack channel",
    ],
    cta: "Talk to sales",
    ctaHref: "/contact-sales",
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

function TierCard({ tier, billingCycle }: { tier: PricingTier; billingCycle: BillingCycle }) {
  const isHighlighted = tier.highlight;
  const isFree = tier.monthlyUsd === 0;
  const { price, sub } = formatPrice(tier.monthlyUsd, billingCycle);

  const cardClasses = isHighlighted
    ? "relative flex flex-col rounded-card border-2 border-accent-blue bg-bg-panel p-7 shadow-elevated"
    : "relative flex flex-col rounded-card border border-border-default bg-bg-panel p-7";

  const labelClasses = isHighlighted
    ? "text-[11px] font-semibold uppercase tracking-widest text-accent-blue"
    : "text-[11px] font-semibold uppercase tracking-widest text-fg-faint";

  return (
    <div className={cardClasses}>
      {isHighlighted && tier.highlightLabel && (
        <div
          aria-label={`${tier.highlightLabel} plan`}
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-blue px-3.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
        >
          {tier.highlightLabel}
        </div>
      )}

      {/* Header */}
      <div>
        <p className={labelClasses}>{tier.label}</p>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight text-fg-primary">
            {tier.monthlyUsd === null ? (tier.customLabel ?? "Custom") : price}
          </span>
          {sub && (
            <span className="text-sm font-normal text-fg-muted">{sub}</span>
          )}
        </div>
        {tier.anchorUsd !== undefined && tier.monthlyUsd === null ? (
          <p className="mt-1 text-[11px] font-medium text-fg-muted">
            From ${tier.anchorUsd.toLocaleString()}/mo · 500-host engagement typical
          </p>
        ) : null}
        {billingCycle === "annual" && tier.monthlyUsd !== null && tier.monthlyUsd > 0 ? (
          <p className="mt-1 text-[11px] font-medium text-success-DEFAULT">
            ${tier.monthlyUsd * 10}/yr — save ~17%
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{tier.tagline}</p>
      </div>

      {/* Divider */}
      <div className="my-6 h-px bg-border-subtle" aria-hidden="true" />

      {/* Features */}
      <div className="flex-1">
        <BulletList items={tier.bullets} muted={!isHighlighted && !isFree} />
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
            billingCycle={billingCycle}
            className="block w-full cursor-pointer rounded-card bg-accent-blue py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:opacity-60"
          >
            {tier.cta}
          </CheckoutButton>
        ) : tier.ctaVariant === "secondary" && tier.planCode ? (
          <CheckoutButton
            planCode={tier.planCode}
            billingCycle={billingCycle}
            className="block w-full cursor-pointer rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:opacity-60"
          >
            {tier.cta}
          </CheckoutButton>
        ) : (
          <a
            href={tier.ctaHref ?? "mailto:jamie@obsidiandynamics.co.uk"}
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
// Add-ons row
// ---------------------------------------------------------------------------

function AddOnsRow({ billingCycle }: { billingCycle: BillingCycle }) {
  const isAnnual = billingCycle === "annual";
  const remMonthlyUsd = ADD_ONS.remediator.baseCentsMonthly / 100;
  const remAnnualUsd = ADD_ONS.remediator.baseCentsAnnual / 100;
  const charonMonthlyUsd = ADD_ONS.charon.baseCentsMonthly / 100;
  const charonAnnualUsd = ADD_ONS.charon.baseCentsAnnual / 100;

  const remHeadline = isAnnual ? `$${remAnnualUsd}` : `$${remMonthlyUsd}`;
  const remCadence = isAnnual ? "/ year" : "/ month";
  const charonHeadline = isAnnual ? `$${charonAnnualUsd}` : `$${charonMonthlyUsd}`;
  const charonCadence = remCadence;

  return (
    <div className="mt-12 rounded-card border border-border-subtle bg-bg-panel px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-fg-faint">
          Optional add-ons
        </p>
        <p className="text-xs text-fg-faint">
          Available on Growth and Scale · included on Business and Enterprise
        </p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-border-subtle bg-bg-base p-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-fg-primary">Remediator (HITL AI)</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              Auto-generated remediation plans, sandbox-verified, surfaced for human approval with
              full audit trail. Never runs AI-generated commands directly on your hosts.
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              Includes 250 approved actions/{isAnnual ? "year" : "month"} · $0.10 per extra action
            </p>
          </div>
          <div className="shrink-0 text-sm sm:text-right">
            <p className="text-2xl font-bold text-fg-primary">
              {remHeadline}
              <span className="text-sm font-normal text-fg-muted">{remCadence}</span>
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:items-end">
              <CheckoutButton
                className="inline-flex items-center justify-center rounded-md border border-accent-blue bg-accent-blue/10 px-4 py-2 text-sm font-medium text-accent-blue transition hover:bg-accent-blue/20"
                planCode="growth"
                billingCycle={billingCycle}
                addons={["remediator"]}
              >
                Buy Remediator with Growth
              </CheckoutButton>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-border-subtle bg-bg-base p-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-fg-primary">Charon (cloud janitor)</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              Link read-scoped credentials for DigitalOcean, AWS, or Google Cloud. Inventory scans,
              idle scoring, dismiss/snooze, scan diffs, and optional signed webhooks. Cleanup stays
              human-in-the-loop when enabled on your plan.
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              Boosts linked-account limits on paid tiers — see plan table above.
            </p>
          </div>
          <div className="shrink-0 text-sm sm:text-right">
            <p className="text-2xl font-bold text-fg-primary">
              {charonHeadline}
              <span className="text-sm font-normal text-fg-muted">{charonCadence}</span>
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:items-end">
              <CheckoutButton
                className="inline-flex items-center justify-center rounded-md border border-accent-blue bg-accent-blue/10 px-4 py-2 text-sm font-medium text-accent-blue transition hover:bg-accent-blue/20"
                planCode="growth"
                billingCycle={billingCycle}
                addons={["charon"]}
              >
                Buy Charon with Growth
              </CheckoutButton>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-fg-faint">
        Already on Growth/Scale?{" "}
        <Link href="/settings/billing" className="text-accent-blue hover:underline">
          Manage billing
        </Link>{" "}
        to add an add-on to your existing subscription.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function PricingSection() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  return (
    <section
      aria-labelledby="pricing-heading"
      className="w-full bg-bg-base px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">

        {/* Eyebrow */}
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
          Pricing
        </p>

        {/* Headline */}
        <h2
          id="pricing-heading"
          className="mt-3 text-center text-4xl font-bold tracking-tight text-fg-primary sm:text-5xl"
        >
          Grow at your pace
        </h2>

        {/* Subheadline */}
        <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-fg-muted">
          Plans scale with how many Linux servers you watch. Read-only viewers — investigators,
          auditors, executives — never count toward your paid seats. Start with Lab for free, or
          take a 14-day full-featured trial of any paid tier.
        </p>

        {/* Trial callout */}
        <div className="mx-auto mt-8 max-w-2xl rounded-card border border-border-subtle bg-bg-panel px-6 py-4 text-center">
          <p className="text-sm font-medium text-fg-primary">
            Two ways to start: free Lab tier or 14-day trial of any paid plan
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Lab gives you 5 hosts free forever, no card required. Trials run on Starter caps for
            14 days, then convert to read-only — your data stays put while you decide.
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div
          className="mt-8 flex justify-center"
          role="radiogroup"
          aria-label="Billing cycle"
        >
          <div className="inline-flex rounded-full border border-border-default bg-bg-panel p-1 text-xs">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={billingCycle === c}
                onClick={() => setBillingCycle(c)}
                className={`rounded-full px-4 py-1.5 font-semibold uppercase tracking-wide transition-colors ${
                  billingCycle === c
                    ? "bg-accent-blue text-white"
                    : "text-fg-muted hover:text-fg-primary"
                }`}
              >
                {c}
                {c === "annual" ? (
                  <span className="ml-1.5 rounded bg-success-DEFAULT/15 px-1.5 py-0.5 text-[10px] text-success-DEFAULT">
                    save ~17%
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Cards grid — 7 tiers (6 self-serve in 2 rows of 3 at lg) + Enterprise
            spans the full width on its own row to read as the sales-led step. */}
        <div className="mt-12 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:items-start">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={tier.key === "enterprise" ? "md:col-span-2 lg:col-span-3" : undefined}
            >
              <TierCard tier={tier} billingCycle={billingCycle} />
            </div>
          ))}
        </div>

        {/* Add-ons row */}
        <AddOnsRow billingCycle={billingCycle} />

        {/* Bottom note */}
        <div className="mt-12 rounded-card border border-border-subtle bg-bg-panel px-8 py-5 text-center">
          <p className="text-sm font-medium text-fg-primary">
            Viewers are always free, on every plan
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Team members with read-only access — investigations, findings history, evidence review —
            never consume a paid seat. Only operators and admins who can run scans, modify
            baselines, or manage secrets count toward your seat limit.
          </p>
        </div>

        {/* Legal footer */}
        <p className="mt-8 text-center text-xs text-fg-faint">
          Blackglass is a product of{" "}
          <a href="https://obsidiandynamics.co.uk" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
            Obsidian Dynamics Limited
          </a>
          {" "}(Co. No. 16663833, England &amp; Wales).{" "}Questions?{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          {" "}·{" "}
          <Link href="/terms" className="text-accent-blue hover:underline">Terms</Link>
          {" "}·{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">Privacy</Link>
        </p>

      </div>
    </section>
  );
}
