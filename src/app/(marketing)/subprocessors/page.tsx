import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_CONTACT_EMAIL, marketingMailtoHref } from "@/lib/marketing/contact";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sub-processors · Blackglass by Obsidian Dynamics",
  description:
    "Current list of third-party sub-processors that may process customer personal data on behalf of Blackglass.",
  alternates: { canonical: canonical("/subprocessors") },
};

const EFFECTIVE = "9 May 2026";

type SubprocessorRow = {
  name: string;
  purpose: string;
  dataCategories: string;
  region: string;
  optional?: boolean;
};

/**
 * Source of truth for procurement / DPA review. Each row is a third
 * party that may receive customer personal data when the related
 * feature is enabled. Rows marked optional are only engaged when the
 * customer explicitly turns the integration on.
 *
 * If you change this list, update both:
 *   1. /privacy section 5 ("Third-party processors")
 *   2. The change-notification window in the DPA referenced below
 */
const SUBPROCESSORS: SubprocessorRow[] = [
  {
    name: "DigitalOcean, LLC",
    purpose:
      "Cloud infrastructure: App Platform (web + workers), Managed Postgres, Managed Redis, Spaces (S3-compatible) for evidence storage.",
    dataCategories:
      "Account metadata, host telemetry, baseline snapshots, drift events, evidence bundles, audit log entries, transactional logs.",
    region: "United States and European Union (configurable per workspace)",
  },
  {
    name: "Clerk, Inc.",
    purpose:
      "Authentication, organisation / workspace membership, SAML SSO, SCIM 2.0 provisioning, MFA enforcement.",
    dataCategories:
      "User identifiers (name, email), organisation membership, session events, authentication metadata.",
    region: "United States (SCCs in place)",
  },
  {
    name: "Stripe, Inc.",
    purpose: "Payment processing, subscription billing, customer portal.",
    dataCategories:
      "Billing email, Stripe customer ID, subscription status, payment method metadata (held by Stripe, not by us).",
    region: "United States (SCCs in place)",
  },
  {
    name: "Resend, Inc.",
    purpose:
      "Transactional email: drift alerts, evidence-bundle ready notifications, member invitations.",
    dataCategories:
      "Recipient email address, message subject and body content, delivery status.",
    region: "United States (SCCs in place)",
  },
  {
    name: "Sentry (Functional Software, Inc.)",
    purpose:
      "Error monitoring and performance tracing for the console and workers.",
    dataCategories:
      "Stack traces, request metadata, anonymised user identifier, runtime environment metadata.",
    region: "United States (SCCs in place)",
  },
  {
    name: "OpenAI / Anthropic (when hosted-LLM remediator enabled)",
    purpose:
      "Powers the optional Blackglass remediator service when configured to use a hosted LLM (rather than a self-hosted Ollama instance).",
    dataCategories:
      "Sanitised drift event metadata sent to the model for plan generation. The remediator never sends raw evidence payloads, secrets, or personal data; HITL approval is required before any plan is executed.",
    region: "United States (provider-dependent SCCs)",
    optional: true,
  },
];

/**
 * Sub-processors page mirrors the convention used by Datadog,
 * Snowflake, and other infra-tier vendors: a stable, bookmarkable URL
 * that procurement can re-check before each annual review. The full
 * legal context (data processor obligations, cross-border transfers,
 * SCCs, deletion) lives in the DPA.
 */
export default function SubprocessorsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">
        Legal
      </p>
      <h1 className="mb-1 text-2xl font-bold text-fg-primary">Sub-processors</h1>
      <p className="mb-10 text-xs text-fg-faint">Effective: {EFFECTIVE}</p>

      <Section title="Overview">
        <p>
          Obsidian Dynamics Limited engages the third parties listed below to
          host and operate the Blackglass service. Each receives only the data
          it needs to perform the function described, and is bound by a written
          data processing agreement aligned with UK GDPR / EU GDPR
          requirements.
        </p>
        <p>
          The full legal terms — including roles (controller / processor),
          security obligations, breach notification, deletion, and
          international transfers — are in our{" "}
          <Link href="/dpa" className="text-accent-blue hover:underline">
            Data Processing Addendum
          </Link>
          . Categories of personal data and lawful bases are detailed in the{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Current sub-processors">
        <div className="overflow-x-auto rounded-card border border-border-subtle">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-bg-elevated text-fg-primary">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Purpose</th>
                <th className="px-3 py-2 font-semibold">Data categories</th>
                <th className="px-3 py-2 font-semibold">Region</th>
              </tr>
            </thead>
            <tbody className="text-fg-muted">
              {SUBPROCESSORS.map((row) => (
                <tr
                  key={row.name}
                  className="border-t border-border-subtle align-top"
                >
                  <td className="px-3 py-3">
                    <span className="font-semibold text-fg-primary">
                      {row.name}
                    </span>
                    {row.optional ? (
                      <span className="ml-1 inline-flex items-center rounded-full border border-border-default px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-fg-faint">
                        opt-in
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{row.purpose}</td>
                  <td className="px-3 py-3">{row.dataCategories}</td>
                  <td className="px-3 py-3">{row.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-faint">
          Rows marked <span className="font-semibold">opt-in</span> only apply
          when the related feature is explicitly enabled by an authorised
          workspace administrator. The optional remediator can also run in a
          fully self-hosted mode (local Ollama instance) with no third-party
          LLM provider involved.
        </p>
      </Section>

      <Section title="Change notification">
        <p>
          We maintain this list as the authoritative record of current
          sub-processors. Where required by your agreement or by law, we will
          notify you in advance of material changes (a new sub-processor, or
          a material change in scope of an existing one) so that you have a
          reasonable opportunity to object before the change takes effect.
        </p>
        <p>
          To subscribe to material change notifications, or to ask a procurement
          question, contact{" "}
          <a
            href={marketingMailtoHref("Subprocessors notification — Blackglass")}
            className="text-accent-blue hover:underline"
          >
            {MARKETING_CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Self-hosted deployments">
        <p>
          Customers running the Helm chart on their own Kubernetes cluster are
          themselves the operator: they choose which of the above
          sub-processors are engaged (Stripe and Clerk are typically replaced
          by their own SSO / billing stack), and Obsidian Dynamics processes no
          personal data on their behalf. Setting{" "}
          <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs text-fg-primary">
            BLACKGLASS_AIRGAPPED=true
          </code>{" "}
          short-circuits any outbound calls to public SaaS so the deployment
          can satisfy strict no-egress requirements.
        </p>
      </Section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
        <Link href="/dpa" className="text-accent-blue hover:underline">
          Data Processing Addendum
        </Link>
        <Link href="/privacy" className="text-accent-blue hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-accent-blue hover:underline">
          Terms of Service
        </Link>
        <Link href="/security" className="text-accent-blue hover:underline">
          Security
        </Link>
        <span className="ml-auto">© {new Date().getFullYear()} Obsidian Dynamics Limited</span>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold text-fg-primary">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
