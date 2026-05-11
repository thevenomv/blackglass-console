import type { Metadata } from "next";
import Link from "next/link";
import PricingSection from "@/components/pricing/PricingSection";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  breadcrumbSchema,
  canonical,
  dynamicOgImages,
  faqPageSchema,
  productOfferSchema,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing · Blackglass",
  description:
    "Free Lab tier for homelabs and evaluators, then per-host plans from $59/mo. Team at $89/mo for SMB fleets, Growth from $199. Read-only viewers never count as paid seats. 14-day trial of any paid plan, no card required.",
  alternates: { canonical: canonical("/pricing") },
  openGraph: {
    title: "Pricing · Blackglass",
    description:
      "Plans grow with your Linux fleet — Lab (free) through Enterprise. Seven tiers from $0 to $2,500+/mo. Unlimited read-only teammates on every tier. 14-day trial, no card required.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/pricing"),
    images: dynamicOgImages({
      title: "Pricing",
      subtitle: "Free Lab tier · paid plans from $59/mo · 14-day trial",
    }),
  },
};

/**
 * Tier catalogue for Product+Offer JSON-LD. Mirrors `PLAN_PRICING` and
 * `ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY` in `src/lib/saas/plans.ts`. Lab
 * is omitted because $0 tiers don't need Offer markup; Enterprise is
 * present with the published anchor as `lowPrice` so SERPs reflect the
 * floor without overpromising.
 */
const TIER_SCHEMA: Array<{ name: string; description: string; monthly: number; annual: number }> = [
  { name: "Blackglass Starter",  description: "15 hosts · 3 operator seats · 4 scheduled scans/day · webhook alerts · 30-day drift, 90-day audit retention.", monthly:   59, annual:   590 },
  { name: "Blackglass Team",     description: "25 hosts · 3 operator seats · hourly scans · full API · 90-day drift, 180-day audit retention.",                monthly:   89, annual:   890 },
  { name: "Blackglass Growth",   description: "100 hosts · 5 operator seats · fleet dashboard · 180-day drift retention · Charon live cleanup eligible.",       monthly:  199, annual: 1990 },
  { name: "Blackglass Scale",    description: "200 hosts · 7 operator seats · host groups · approval workflows · 1-year drift retention.",                      monthly:  349, annual: 3490 },
  { name: "Blackglass Business", description: "300 hosts · 10 operator seats · immutable audit log · Remediator add-on included · priority support.",          monthly:  499, annual: 4990 },
  { name: "Blackglass Enterprise", description: "Unlimited hosts/seats, SSO, BYOK, air-gapped option, named CSM, signed SLA. Anchor pricing from $2,500/mo.",  monthly: 2500, annual: 25000 },
];

const FAQ = [
  {
    q: "What's in the free Lab tier?",
    a: "Lab is free forever — 5 Linux hosts, 1 operator seat, unlimited read-only viewers, daily scheduled scan, 30 days of findings history, and read-only API access. Lab also includes 1 linked cloud account in Charon (read-only inventory) so you can see waste estimates against real data, not just the public estimator. No credit card required, no time limit. Self-host or use the cloud console — your call.",
  },
  {
    q: "How do you bill for hosts?",
    a: "Each plan includes a host quota (5 / 15 / 25 / 100 / 200 / 300 depending on tier). If you exceed your quota, additional hosts are billed at the per-host overage rate shown on the plan card. Hosts you delete from the dashboard immediately stop counting.",
  },
  {
    q: "Why a Team tier between Starter and Growth?",
    a: "The previous ladder jumped from Starter ($39 / 10 hosts) straight to Growth ($199 / 100 hosts) — a 5× cliff with no landing pad for SMB teams in the 15–50 host band. Team at $89/mo (25 hosts, 3 seats, hourly scans, full API) closes that gap so you don't have to negotiate or buy capacity you don't need.",
  },
  {
    q: "Do I pay for viewers?",
    a: "No. Read-only viewers and guest auditors are always unlimited on every plan, including Lab. Only operators, admins, and owners — roles that can run scans, modify baselines, or manage workspace settings — count toward your paid seat limit.",
  },
  {
    q: "What counts as an operator seat?",
    a: "An operator seat is consumed by any workspace member with the owner, admin, or operator role. Viewer and guest auditor roles do not consume a seat.",
  },
  {
    q: "What is the Remediator add-on?",
    a: "Remediator is the human-in-the-loop AI remediation engine. It generates fix plans for detected drift, sandbox-verifies them, and surfaces them for operator approval — it never runs commands directly on your hosts. Available as a $99/mo add-on on Growth and Scale, included on Business and Enterprise. Includes 250 approved actions/month with $0.10 per extra action.",
  },
  {
    q: "What happens when the trial ends?",
    a: "After 14 days, if you have not subscribed to a paid plan, your workspace becomes read-only. You can still log in and review existing data — baselines, findings history, evidence bundles — but operational actions (new scans, baseline captures, host management) are locked until you upgrade. There is no automatic charge at trial end. After 60 days of inactivity we email you before deleting trial data; ping us if you want it preserved longer.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of the current billing period. If you downgrade to a plan with a lower host or seat limit, you will need to reduce your host count or reassign seats to match the new quota before the downgrade date.",
  },
  {
    q: "Is annual billing available?",
    a: "Yes. Use the Monthly / Annual toggle above the plan cards — annual is billed once per year at 10× the monthly price (≈ 17 % off, or two months free). Multi-year commits (2-year and 3-year) are available on Business and Enterprise — email us for the discount schedule.",
  },
  {
    q: "How long do you keep my data?",
    a: "Retention scales with your plan. Lab and Starter keep 30 days of drift history; Starter keeps 90 days of audit log (SOC 2 minimum). Team: 90 days drift / 180 days audit. Growth: 180 days drift / 1 year audit. Scale: 1 year drift / 2 years audit. Business: same as Scale plus immutable audit log. Enterprise: unlimited drift retention plus up to 7 years audit (SOX/PCI residency). You can lower these caps in Settings → Retention; we never raise them above your plan's max.",
  },
  {
    q: "How often can scans run?",
    a: "Scheduled scan frequency scales with the plan: Lab 1×/day, Starter 4×/day, Team and Growth hourly, Scale every 30 min, Business every 15 min, Enterprise continuous. Manual scans triggered from the dashboard are not capped.",
  },
  {
    q: "Is SSO available?",
    a: "SAML/OIDC single sign-on is included on Enterprise. It's also available as an add-on on Scale and Business — contact us if your organisation requires SSO at a smaller seat count.",
  },
  {
    q: "Can I use my own KMS key (BYOK)?",
    a: "Yes — Enterprise customers can wrap their workspace's data-encryption keys with their own AWS KMS key or HashiCorp Vault Transit key. Plaintext SSH credentials and other tenant secrets never touch the Blackglass root key. Setup is a single Settings → Identity → Bring your own key form, and we round-trip-verify the key the moment you save it. Email us with your KMS Key ARN to enable.",
  },
  {
    q: "Do you support air-gapped deployments?",
    a: "Yes, on Enterprise. We offer a locked-down mode for networks that cannot call public SaaS APIs, plus packaging for self-hosted Kubernetes. Health checks let you prove the restrictions are active. Technical teams get exact switch names and diagrams on the security page.",
  },
  {
    q: "Are there discounts for non-profits or open-source maintainers?",
    a: "Yes — 50 % off any paid tier with a verified .edu domain, registered non-profit status, or named open-source project (Linux Foundation, CNCF, Apache, etc.). Email us with the details.",
  },
];

export default function PricingPage() {
  const pricingUrl = canonical("/pricing") ?? "/pricing";
  const breadcrumb = breadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Pricing", url: "/pricing" },
  ]);
  return (
    <main>
        <JsonLd data={faqPageSchema(FAQ)} id="schema-faq" />
        <JsonLd data={breadcrumb} id="schema-breadcrumb" />
        {TIER_SCHEMA.map((tier) => (
          <JsonLd
            key={tier.name}
            id={`schema-product-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}
            data={productOfferSchema({
              name: tier.name,
              description: tier.description,
              url: pricingUrl,
              priceMonthlyUsd: tier.monthly,
              priceAnnualUsd: tier.annual,
            })}
          />
        ))}

        {/* Visible h1 — was missing pre-2026-05-11; weakened topical signal for the page. */}
        <header className="border-b border-border-subtle px-4 pt-12 pb-6 sm:pt-16">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Pricing</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg-primary sm:text-4xl">
              Plans for every Linux fleet — from homelab to enterprise
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
              Free Lab tier forever. Paid tiers from $59/mo. Read-only viewers and guest auditors are
              unlimited on every plan. 14-day trial of any paid tier, no credit card required.
            </p>
          </div>
        </header>

        <PricingSection />

        {/* FAQ */}
        <section className="border-t border-border-subtle px-4 py-16 sm:py-20" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-heading" className="text-2xl font-semibold text-fg-primary">
              Frequently asked questions
            </h2>
            <dl className="mt-8 space-y-6">
              {FAQ.map((item) => (
                <div key={item.q} className="rounded-lg border border-border-default bg-bg-panel px-5 py-4">
                  <dt className="font-semibold text-fg-primary">{item.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-fg-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm">
              More questions?{" "}
              <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
                Email us
              </a>{" "}
              or{" "}
              <Link href="/book" className="text-accent-blue hover:underline">
                book a walkthrough
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Back to console (for signed-in users who navigate here from the app) */}
        <div className="pb-8 text-center">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-fg-faint hover:text-accent-blue hover:underline focus-visible:outline-none"
          >
            Back to console
          </Link>
        </div>
      </main>
  );
}
