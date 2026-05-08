import type { Metadata } from "next";
import Link from "next/link";
import PricingSection from "@/components/pricing/PricingSection";

export const metadata: Metadata = {
  title: "Pricing · Blackglass",
  description:
    "Straightforward per-server pricing. People who only need to read along never count as paid seats. Start with a 14-day trial — no card required.",
  openGraph: {
    title: "Pricing · Blackglass",
    description:
      "Plans grow with your Linux fleet. Unlimited read-only teammates on every paid tier. 14-day trial, no card required.",
    type: "website",
    siteName: "Blackglass",
  },
};

const FAQ = [
  {
    q: "How do you bill for hosts?",
    a: "Each plan includes a host quota (25 / 100 / 300 depending on tier). If you exceed your quota, additional hosts are billed at the per-host overage rate on your plan. You can see the overage rate on each plan card above.",
  },
  {
    q: "Do I pay for viewers?",
    a: "No. Read-only viewers and guest auditors are always unlimited on paid plans. Only operators, admins, and owners — roles that can run scans, modify baselines, or manage workspace settings — count toward your paid seat limit.",
  },
  {
    q: "What counts as an operator seat?",
    a: "An operator seat is consumed by any workspace member with the owner, admin, or operator role. Viewer and guest auditor roles do not consume a seat.",
  },
  {
    q: "What happens when the trial ends?",
    a: "After 14 days, if you have not subscribed to a paid plan, your workspace becomes read-only. You can still log in and review existing data — baselines, findings history, evidence bundles — but operational actions (new scans, baseline captures, host management) are locked until you upgrade. There is no automatic charge at trial end.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of the current billing period. If you downgrade to a plan with a lower host or seat limit, you will need to reduce your host count or reassign seats to match the new quota before the downgrade date.",
  },
  {
    q: "Is annual billing available?",
    a: "Yes. Use the Monthly / Annual toggle above the plan cards — annual is billed once per year at 10× the monthly price (≈ 17% off, or two months free). Already on monthly? Email us and we'll switch your subscription without losing your current period.",
  },
  {
    q: "What is included in the free trial?",
    a: "The trial is a full-featured workspace: up to 10 hosts, 2 operator seats, unlimited viewers, change detection, baseline capture, evidence bundles, and API access. No credit card is required to start.",
  },
  {
    q: "Is SSO available?",
    a: "SAML/OIDC single sign-on is available on the Enterprise plan. Contact us if your organisation requires SSO for a smaller seat count.",
  },
  {
    q: "Can I use my own KMS key (BYOK)?",
    a: "Yes — Enterprise customers can wrap their workspace's data-encryption keys with their own AWS KMS key or HashiCorp Vault Transit key. Plaintext SSH credentials and other tenant secrets never touch the Blackglass root key. Setup is a single Settings → Identity → Bring your own key form, and we round-trip-verify the key the moment you save it. Email us with your KMS Key ARN to enable.",
  },
  {
    q: "Do you support air-gapped deployments?",
    a: "Yes. We offer a locked-down mode for networks that cannot call public SaaS APIs, plus packaging for self-hosted Kubernetes. Health checks let you prove the restrictions are active. Technical teams get exact switch names and diagrams on the security page.",
  },
];

export default function PricingPage() {
  return (
    <main>
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
