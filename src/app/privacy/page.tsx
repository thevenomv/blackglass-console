import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | BLACKGLASS by Obsidian Dynamics",
  description:
    "Privacy Policy for BLACKGLASS, a product of Obsidian Dynamics Limited (Co. No. 16663833). UK GDPR compliant.",
};

const EFFECTIVE = "2 May 2026";

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
          in connection with BLACKGLASS. We are registered in England &amp; Wales under Company
          Number <strong className="text-fg-primary">16663833</strong>.
        </p>
        <p>
          Contact:{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          {" "}|{" "}
          <ExternalLink href="https://obsidiandynamics.co.uk">obsidiandynamics.co.uk</ExternalLink>
        </p>
      </Section>

      <Section title="2. What data we collect">
        <p>We process the following categories of personal data:</p>
        <Table
          rows={[
            ["Account data", "Name, email address, password hash", "Account creation and authentication"],
            ["Billing data", "Billing email, Stripe customer ID, subscription status", "Processing payments and managing your subscription"],
            ["Usage data", "IP address, browser/device type, pages visited, session duration", "Security, fraud prevention, service improvement"],
            ["Host configuration metadata", "Configuration state of Linux hosts you enrol (ports, users, packages, kernel params, etc.)", "Core service — computing drift and generating reports"],
            ["Audit log data", "Timestamped record of operator actions within BLACKGLASS", "Security and compliance audit trail"],
            ["Support communications", "Emails and messages you send us", "Responding to support requests"],
          ]}
        />
        <p className="mt-3 font-medium text-fg-primary">What we do not collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>File contents from your hosts</li>
          <li>Environment variables or application secrets from your hosts</li>
          <li>SSH private keys (credentials are held in memory only for the duration of a scan)</li>
        </ul>
      </Section>

      <Section title="3. Legal basis for processing (UK GDPR)">
        <Table
          rows={[
            ["Account and billing data", "Contract performance (Art. 6(1)(b)) — necessary to provide the Service"],
            ["Usage and security data", "Legitimate interests (Art. 6(1)(f)) — fraud prevention and service security"],
            ["Host configuration metadata", "Contract performance (Art. 6(1)(b)) — the core function of the Service"],
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
            ["Stripe, Inc.", "Payment processing and billing portal", "United States (SCCs in place)"],
            ["DigitalOcean, LLC", "Cloud infrastructure hosting (App Platform, Spaces)", "United States / EU (SCCs in place)"],
            ["Sentry (Functional Software, Inc.)", "Error monitoring and performance tracing", "United States (SCCs in place)"],
          ]}
          headers={["Processor", "Purpose", "Location"]}
        />
        <p className="mt-2">
          We do not sell your personal data to third parties.
        </p>
      </Section>

      <Section title="6. Data retention">
        <Table
          rows={[
            ["Account data", "Duration of account plus 30 days after closure"],
            ["Billing records", "7 years (HMRC requirement)"],
            ["Host configuration metadata", "Per plan: 30 days (Local), 180 days (Team), custom (Fleet)"],
            ["Audit logs", "Per plan retention window; append-only during retention"],
            ["Usage/security logs", "90 days"],
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
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          . We will respond within 30 days. You also have the right to lodge a complaint with the
          Information Commissioner&rsquo;s Office (ICO) at{" "}
          <ExternalLink href="https://ico.org.uk">ico.org.uk</ExternalLink>.
        </p>
      </Section>

      <Section title="8. Cookies and tracking">
        <p>
          BLACKGLASS uses only technically necessary cookies (session authentication). We do not use
          advertising or cross-site tracking cookies. Error monitoring via Sentry may collect
          anonymised session replay data (on error only) to diagnose faults; this can be disabled
          on request.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          All data in transit is protected by TLS 1.3. Data at rest is encrypted with AES-256.
          Access to production systems is restricted to authorised personnel. We conduct regular
          dependency vulnerability reviews. For details, see the Security Overview section in the
          BLACKGLASS console dashboard.
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
          We may update this Privacy Policy. Material changes will be notified by email or in-app
          notice. The effective date at the top of this page will always reflect the current
          version.
        </p>
      </Section>

      <Section title="12. Contact and complaints">
        <p>
          Data protection enquiries:{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          <br />
          Obsidian Dynamics Limited, registered in England &amp; Wales, Co. No. 16663833
          <br />
          Supervisory authority: Information Commissioner&rsquo;s Office (ICO),{" "}
          <ExternalLink href="https://ico.org.uk">ico.org.uk</ExternalLink>
        </p>
      </Section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
        <Link href="/terms" className="text-accent-blue hover:underline">Terms of Service</Link>
        <Link href="/pricing" className="text-accent-blue hover:underline">Pricing</Link>
        <Link href="/" className="text-accent-blue hover:underline">Back to console</Link>
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
