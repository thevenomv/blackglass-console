import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | BLACKGLASS by Obsidian Dynamics",
  description:
    "Terms of Service for BLACKGLASS, a product of Obsidian Dynamics Limited (Co. No. 16663833).",
};

const EFFECTIVE = "2 May 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">
        Legal
      </p>
      <h1 className="mb-1 text-2xl font-bold text-fg-primary">Terms of Service</h1>
      <p className="mb-10 text-xs text-fg-faint">Effective: {EFFECTIVE}</p>

      <Section title="1. Who we are">
        <p>
          BLACKGLASS is provided by{" "}
          <strong className="text-fg-primary">Obsidian Dynamics Limited</strong>, a company
          registered in England &amp; Wales (Company Number{" "}
          <strong className="text-fg-primary">16663833</strong>), with its registered office in
          England &amp; Wales. Our website is{" "}
          <ExternalLink href="https://obsidiandynamics.co.uk">obsidiandynamics.co.uk</ExternalLink>.
          Contact us at{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          .
        </p>
      </Section>

      <Section title="2. The service">
        <p>
          BLACKGLASS is a configuration-integrity and drift-detection platform for Linux hosts. It
          allows authorised operators to capture baselines, detect configuration drift, classify
          risk, and export audit evidence. These Terms govern your access to and use of the
          BLACKGLASS console, API, and collector tooling (collectively, the <em>&ldquo;Service&rdquo;</em>).
        </p>
      </Section>

      <Section title="3. Acceptance">
        <p>
          By creating an account or using the Service you agree to these Terms. If you are accepting
          on behalf of an organisation, you confirm you have authority to bind that organisation. If
          you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="4. Subscriptions and billing">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-fg-primary">BLACKGLASS Local</strong> is free with no payment
            required.
          </li>
          <li>
            <strong className="text-fg-primary">BLACKGLASS Team</strong> is billed monthly or
            annually in advance via Stripe. Prices are shown on our{" "}
            <Link href="/pricing" className="text-accent-blue hover:underline">
              pricing page
            </Link>
            .
          </li>
          <li>
            <strong className="text-fg-primary">BLACKGLASS Fleet</strong> is available under a
            separate order form. Contact us for pricing.
          </li>
          <li>
            Subscriptions renew automatically. You may cancel at any time via the billing portal;
            cancellation takes effect at the end of the current billing period. No refunds are
            issued for partial periods except where required by law.
          </li>
          <li>
            We may change prices with 30 days&rsquo; notice. Continued use after the effective date
            constitutes acceptance.
          </li>
          <li>
            All prices are exclusive of VAT where applicable. VAT will be charged where required by
            UK law.
          </li>
        </ul>
      </Section>

      <Section title="5. Acceptable use">
        <p className="mb-2">You must not use the Service to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Scan or collect data from hosts you do not own or have explicit written permission to monitor.</li>
          <li>Circumvent security controls, conduct denial-of-service attacks, or distribute malware.</li>
          <li>Resell or sublicense the Service without our written consent.</li>
          <li>Violate any applicable law or regulation, including the Computer Misuse Act 1990.</li>
        </ul>
        <p className="mt-2">
          We reserve the right to suspend or terminate accounts that breach these terms.
        </p>
      </Section>

      <Section title="6. Data and privacy">
        <p>
          Our collection and use of personal data is described in our{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">
            Privacy Policy
          </Link>
          . BLACKGLASS collects only configuration metadata required to compute drift — not file
          contents, environment variables, or secrets. You retain ownership of all host data
          collected through the Service.
        </p>
        <p className="mt-2">
          If you use BLACKGLASS on behalf of an organisation and we process personal data for you,
          our{" "}
          <Link href="/dpa" className="text-accent-blue hover:underline">
            Data Processing Addendum
          </Link>{" "}
          describes our processor commitments and references infrastructure providers such as
          DigitalOcean where the Service is hosted.
        </p>
      </Section>

      <Section title="7. Intellectual property">
        <p>
          The Service, including all software, documentation, and design, is owned by Obsidian
          Dynamics Limited and protected by copyright and other intellectual property laws. These
          Terms do not grant you any rights in the Service other than a limited licence to use it
          in accordance with these Terms.
        </p>
      </Section>

      <Section title="8. Availability and uptime">
        <p>
          We aim to provide a reliable service but do not guarantee uninterrupted availability. We
          may suspend the Service for maintenance with reasonable notice where possible. Planned
          downtime will be communicated via our status channels.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Obsidian Dynamics Limited shall not be liable
          for indirect, incidental, special, consequential, or punitive damages arising from your
          use of or inability to use the Service. Our total liability to you for any claims arising
          under these Terms shall not exceed the amounts you paid us in the twelve months preceding
          the claim.
        </p>
        <p className="mt-2">
          Nothing in these Terms excludes or limits liability for fraud, death or personal injury
          caused by negligence, or any other liability that cannot be limited by law.
        </p>
      </Section>

      <Section title="10. Termination">
        <p>
          Either party may terminate these Terms by closing the account or ceasing use of the
          Service. On termination, your right to access the Service ends immediately. We will
          retain and then delete your data in accordance with our{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="11. Governing law">
        <p>
          These Terms are governed by the law of England &amp; Wales. Any disputes shall be subject
          to the exclusive jurisdiction of the courts of England &amp; Wales.
        </p>
      </Section>

      <Section title="12. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be notified by email
          or in-app notice at least 14 days before taking effect. Continued use of the Service
          after the effective date constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          For questions about these Terms, contact us at{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>{" "}
          or via{" "}
          <ExternalLink href="https://obsidiandynamics.co.uk">obsidiandynamics.co.uk</ExternalLink>.
        </p>
      </Section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
        <Link href="/privacy" className="text-accent-blue hover:underline">Privacy Policy</Link>
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
