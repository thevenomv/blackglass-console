import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_CONTACT_EMAIL, marketingMailtoHref } from "@/lib/marketing/contact";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy · Blackglass by Obsidian Dynamics",
  description:
    "Privacy Policy for Blackglass, a product of Obsidian Dynamics Limited (Co. No. 16663833). ICO registration ZC141175. UK GDPR compliant.",
  alternates: { canonical: canonical("/privacy") },
};

const EFFECTIVE = "10 May 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">
        Legal
      </p>
      <h1 className="mb-1 text-2xl font-bold text-fg-primary">Privacy Policy</h1>
      <p className="mb-10 text-xs text-fg-faint">Effective: {EFFECTIVE}</p>

      <Section title="1. Who we are">
        <p>
          <strong className="text-fg-primary">Obsidian Dynamics Limited</strong> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;) is the data controller for personal data processed
          in connection with Blackglass. We are registered in England &amp; Wales under Company
          Number <strong className="text-fg-primary">16663833</strong>.
        </p>
        <p>
          Registered office: Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset{" "}
          <span className="whitespace-nowrap">BH16 6FA</span>, United Kingdom.
        </p>
        <p>
          UK data protection registration (ICO):{" "}
          <strong className="text-fg-primary">ZC141175</strong>. You can verify our entry on the
          Information Commissioner&rsquo;s Office register at{" "}
          <ExternalLink href="https://ico.org.uk">ico.org.uk</ExternalLink>.
        </p>
        <p>
          Contact:{" "}
          <a href={marketingMailtoHref()} className="text-accent-blue hover:underline">
            {MARKETING_CONTACT_EMAIL}
          </a>
          {" "}|{" "}
          <ExternalLink href="https://obsidiandynamics.co.uk">obsidiandynamics.co.uk</ExternalLink>
        </p>
      </Section>

      <Section title="2. What data we collect">
        <p>We process the following categories of personal data:</p>
        <Table
          rows={[
            [
              "Account & access data",
              "Billing contact via Stripe when subscribed; console authentication events (session tokens, IP at sign-in, role); deployment passphrase is not stored by us when supplied only via environment configuration",
              "Account access, security audit trail, and subscription management",
            ],
            ["Billing data", "Billing email, Stripe customer ID, subscription status", "Processing payments and managing your subscription"],
            ["Usage data", "IP address, browser/device type, pages visited, session duration", "Security, fraud prevention, service improvement"],
            ["Host configuration metadata", "Configuration state of Linux hosts you enrol (listening ports, local users and groups, sudo policy, sshd effective configuration, systemd unit files, cron entries, installed packages, file integrity hashes for critical paths)", "Core service — computing drift and generating reports"],
            [
              "Cloud inventory metadata (Charon)",
              "When you link a cloud account: resource identifiers, types, regions/zones, tags, utilisation signals, and scores derived by Blackglass — from DigitalOcean/AWS/Google APIs using credentials you provide (stored envelope-encrypted). May include personal data if your cloud metadata does (e.g. tag values).",
              "Optional feature — idle-resource visibility and approved cleanup workflows",
            ],
            ["Audit log data", "Timestamped record of operator actions within Blackglass", "Security and compliance audit trail"],
            ["Support communications", "Emails and messages you send us", "Responding to support requests"],
          ]}
        />
        <p className="mt-3 font-medium text-fg-primary">What we do not collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>File contents from your hosts</li>
          <li>Environment variables or application secrets from your hosts</li>
          <li>
            SSH private keys or cloud API secrets as plain text at rest (they are envelope-encrypted;
            decrypted only in memory for the duration of a scan job)
          </li>
        </ul>
      </Section>

      <Section title="3. Legal basis for processing (UK GDPR)">
        <Table
          rows={[
            ["Account and billing data", "Contract performance (Art. 6(1)(b)) — necessary to provide the Service"],
            ["Usage and security data", "Legitimate interests (Art. 6(1)(f)) — fraud prevention and service security"],
            ["Host configuration metadata", "Contract performance (Art. 6(1)(b)) — the core function of the Service"],
            [
              "Cloud inventory metadata (Charon)",
              "Contract performance (Art. 6(1)(b)) — optional feature you enable by linking credentials",
            ],
            ["Marketing communications", "Consent (Art. 6(1)(a)) — you may opt in or out at any time"],
          ]}
          headers={["Data type", "Legal basis"]}
        />
      </Section>

      <Section title="4. How we use your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide, maintain, and improve the Service</li>
          <li>Process subscription payments and manage billing</li>
          <li>Send service-critical communications (receipts, security alerts, downtime notices)</li>
          <li>Detect and prevent fraud and abuse</li>
          <li>Comply with legal obligations</li>
          <li>With your consent: product updates and new feature announcements</li>
        </ul>
      </Section>

      <Section title="5. Third-party processors">
        <p>We share data with the following sub-processors under appropriate data processing agreements:</p>
        <Table
          rows={[
            ["Clerk, Inc.", "Authentication, organisation/workspace membership, SSO/SAML, SCIM provisioning, MFA enforcement", "United States (SCCs in place)"],
            ["Stripe, Inc.", "Payment processing and billing portal", "United States (SCCs in place)"],
            [
              "DigitalOcean, LLC",
              "Cloud infrastructure — App Platform (compute), Managed Databases (PostgreSQL), Managed Redis/Valkey (queues + rate limits), Spaces (S3-compatible object storage for optional audit/baseline artefacts)",
              "EU / US regions per your deployment (SCCs / UK IDTA as applicable)",
            ],
            ["Sentry (Functional Software, Inc.)", "Error monitoring and performance tracing", "United States (SCCs in place)"],
            ["Doppler, Inc. (optional)", "Secrets configuration when enabled by the customer", "United States (SCCs in place)"],
          ]}
          headers={["Processor", "Purpose", "Location"]}
        />
        <p className="mt-2">
          We do not sell your personal data to third parties.
        </p>
        <p className="mt-2">
          If we add a new sub-processor or materially change how an existing one processes personal
          data, we will update this page, advance the effective date where appropriate, and notify
          active account contacts by email and/or an in-console notice before the change takes
          effect (or as soon as reasonably practicable if we are legally required to act sooner).
        </p>
      </Section>

      <Section title="6. Data retention">
        <Table
          rows={[
            ["Account data", "Duration of account plus 30 days after closure"],
            ["Billing records", "7 years (HMRC requirement)"],
            ["Host configuration metadata", "Per plan: 30 days on Lab and Starter; 180 days on Growth; 365 days on Scale and Business; custom on Enterprise"],
            [
              "Charon findings & linked-account metadata",
              "Retained with other tenant configuration data under the same workspace retention rules; suppressions and cleanup queue rows follow tenant RLS",
            ],
            ["Audit logs (saas_audit_events)", "Per plan retention window; append-only during retention; exportable as deterministic JSONL with integrity verification"],
            ["Usage / security logs", "90 days"],
          ]}
          headers={["Data type", "Retention period"]}
        />
      </Section>

      <Section title="7. Your rights under UK GDPR">
        <p>You have the right to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-fg-primary">Access</strong> — request a copy of the personal data we hold about you</li>
          <li><strong className="text-fg-primary">Rectification</strong> — ask us to correct inaccurate data</li>
          <li><strong className="text-fg-primary">Erasure</strong> — ask us to delete your data (&ldquo;right to be forgotten&rdquo;) where no legal retention obligation applies</li>
          <li><strong className="text-fg-primary">Restriction</strong> — ask us to restrict processing in certain circumstances</li>
          <li><strong className="text-fg-primary">Portability</strong> — receive your data in a structured, machine-readable format</li>
          <li><strong className="text-fg-primary">Object</strong> — object to processing based on legitimate interests</li>
          <li><strong className="text-fg-primary">Withdraw consent</strong> — at any time for consent-based processing (e.g. marketing)</li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, email{" "}
          <a href={marketingMailtoHref()} className="text-accent-blue hover:underline">
            {MARKETING_CONTACT_EMAIL}
          </a>
          . We will respond within 30 days. You also have the right to lodge a complaint with the
          Information Commissioner&rsquo;s Office (ICO) at{" "}
          <ExternalLink href="https://ico.org.uk">ico.org.uk</ExternalLink>.
        </p>
      </Section>

      <Section title="8. Cookies and tracking">
        <p>
          Blackglass uses only technically necessary cookies (session authentication). We do not use
          advertising or cross-site tracking cookies. If we introduce non-essential cookies or
          similar technologies in future, we will obtain consent where UK law requires before they
          are set. Error monitoring via Sentry may collect anonymised session replay data (on error
          only) to diagnose faults; this can be disabled on request.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          All data in transit is protected by TLS 1.3. Data at rest is encrypted with AES-256.
          SSH credentials used to scan your hosts are envelope-encrypted at rest (KMS providers:
          local key, HashiCorp Vault, or AWS KMS) and only decrypted in memory for the duration of
          a scan. Cloud API credentials for Charon follow the same envelope-encryption model.
          Tenant data is isolated at the database layer using PostgreSQL row-level security; the
          application sets the tenant GUC on every authenticated request. Outbound webhooks
          (including optional Charon scan-complete events) are HMAC-SHA256 signed and
          rotation-aware. We conduct regular dependency vulnerability reviews and run an automated
          DAST baseline against staging.
        </p>
        <p className="mt-2">
          Full details: see our{" "}
          <Link href="/security" className="text-accent-blue hover:underline">
            Security overview
          </Link>
          .
        </p>
      </Section>

      <Section title="10. International transfers">
        <p>
          Some of our sub-processors are based outside the UK. Where personal data is transferred
          to countries without an adequacy decision, we rely on Standard Contractual Clauses (SCCs)
          approved by the ICO to ensure an equivalent level of protection.
        </p>
      </Section>

      <Section title="11. Changes to this policy">
        <p>
          We review this Privacy Policy at least annually and whenever our processing activities or
          sub-processors change materially. We may update this page between reviews for clarity or
          legal compliance. Material changes will be notified by email or in-app notice. The
          effective date at the top of this page will always reflect the current version.
        </p>
      </Section>

      <Section title="12. Organisational customers (processor relationship)">
        <p>
          Where you deploy Blackglass for an organisation and we process personal data on your
          instructions, our{" "}
          <Link href="/dpa" className="text-accent-blue hover:underline">
            Data Processing Addendum
          </Link>{" "}
          supplements these disclosures for controller–processor relationships.
        </p>
      </Section>

      <Section title="13. Contact and complaints">
        <p>
          Data protection enquiries:{" "}
          <a href={marketingMailtoHref()} className="text-accent-blue hover:underline">
            {MARKETING_CONTACT_EMAIL}
          </a>
          <br />
          <span className="mt-2 block">
            Obsidian Dynamics Limited, registered in England &amp; Wales, Co. No. 16663833
            <br />
            Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset BH16 6FA, United Kingdom
            <br />
            ICO registration reference: ZC141175
          </span>
          <span className="mt-2 block">
            Supervisory authority: Information Commissioner&rsquo;s Office (ICO),{" "}
            <ExternalLink href="https://ico.org.uk">ico.org.uk</ExternalLink>
          </span>
        </p>
      </Section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
        <Link href="/terms" className="text-accent-blue hover:underline">Terms of Service</Link>
        <Link href="/dpa" className="text-accent-blue hover:underline">Data Processing Addendum</Link>
        <Link href="/pricing" className="text-accent-blue hover:underline">Pricing</Link>
        <Link href="/dashboard" className="text-accent-blue hover:underline">Back to console</Link>
        <span className="ml-auto">© {new Date().getFullYear()} Obsidian Dynamics Limited</span>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold text-fg-primary">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
      {children}
    </a>
  );
}

function Table({
  rows,
  headers,
}: {
  rows: string[][];
  headers?: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="mt-2 w-full border-collapse text-xs">
        {headers && (
          <thead>
            <tr className="border-b border-border-subtle">
              {headers.map((h) => (
                <th key={h} className="py-2 pr-4 text-left font-semibold text-fg-primary last:pr-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`py-2 pr-4 align-top last:pr-0 ${j === 0 ? "font-medium text-fg-primary" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
