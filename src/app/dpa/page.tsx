import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Processing Addendum | BLACKGLASS by Obsidian Dynamics",
  description:
    "Data Processing Addendum (UK GDPR / UK Data Protection Act 2018) for organisational customers of BLACKGLASS.",
};

const EFFECTIVE = "2 May 2026";

export default function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">
        Legal
      </p>
      <h1 className="mb-1 text-2xl font-bold text-fg-primary">
        Data Processing Addendum
      </h1>
      <p className="mb-10 text-xs text-fg-faint">Effective: {EFFECTIVE}</p>

      <Section title="1. Purpose and incorporation">
        <p>
          This Data Processing Addendum (&ldquo;<strong className="text-fg-primary">DPA</strong>
          &rdquo;) applies when you are an organisation and we process personal data on your behalf
          in connection with BLACKGLASS. It forms part of our agreement with you and supplements our{" "}
          <Link href="/terms" className="text-accent-blue hover:underline">
            Terms of Service
          </Link>
          . If you are an individual consumer using BLACKGLASS in a personal capacity, our{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">
            Privacy Policy
          </Link>{" "}
          describes how Obsidian Dynamics Limited acts as data controller for account and service
          data.
        </p>
      </Section>

      <Section title="2. Roles">
        <p>
          Where this DPA applies, you are the <strong className="text-fg-primary">data controller</strong>{" "}
          and Obsidian Dynamics Limited (Company No. 16663833) is the{" "}
          <strong className="text-fg-primary">data processor</strong>, processing personal data only on
          your documented instructions as described in the Service and these terms, unless UK law
          requires otherwise (in which case we will inform you unless prohibited).
        </p>
      </Section>

      <Section title="3. Subject matter, nature, and purpose">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-fg-primary">Subject matter:</strong> provision of the BLACKGLASS
            configuration-integrity and drift-detection service.
          </li>
          <li>
            <strong className="text-fg-primary">Duration:</strong> for the term of your subscription
            or use of the Service, plus the period needed to delete or return data in accordance with
            the agreement.
          </li>
          <li>
            <strong className="text-fg-primary">Nature:</strong> hosting, storage, automated
            processing, security monitoring, and support as part of operating the Service.
          </li>
          <li>
            <strong className="text-fg-primary">Purpose:</strong> to provide the features you activate
            (baselines, drift analysis, audit evidence, notifications, and related console and API
            access).
          </li>
        </ul>
      </Section>

      <Section title="4. Types of personal data and data subjects">
        <p>
          Categories may include: identifiers (name, email, billing contact), authentication metadata
          (session events, IP at login), subscription metadata, and technical data relating to users
          you authorise to access the Service. Host telemetry processed by BLACKGLASS is primarily
          configuration metadata; where it can relate to an identifiable natural person, it is treated
          as personal data when required by applicable law.
        </p>
      </Section>

      <Section title="5. Processor obligations">
        <p>We will:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>process personal data only on documented instructions from you (including this DPA);</li>
          <li>
            ensure persons authorised to process data are bound by appropriate confidentiality
            obligations;
          </li>
          <li>
            implement appropriate technical and organisational measures, including encryption in
            transit (TLS), access controls to production systems, and audit logging of security-relevant
            console actions where enabled;
          </li>
          <li>
            assist you with responding to data subject requests and with breach notification, taking
            into account the nature of processing and the information available to us;
          </li>
          <li>
            at your choice, delete or return personal data after the end of the provision of services,
            except where UK law requires continued storage;
          </li>
          <li>
            make available information reasonably necessary to demonstrate compliance and allow for
            audits mandated under UK GDPR, subject to reasonable notice and confidentiality.
          </li>
        </ul>
      </Section>

      <Section title="6. Sub-processors">
        <p>
          We engage sub-processors to host and operate the Service. The current list, including the
          nature of processing and locations, is set out in our{" "}
          <Link href="/privacy" className="text-accent-blue hover:underline">
            Privacy Policy
          </Link>{" "}
          (Section 5 — Third-party processors). Notably,{" "}
          <strong className="text-fg-primary">DigitalOcean, LLC</strong> provides cloud infrastructure
          (including App Platform and, where configured, Spaces object storage) under their data
          processing terms. We will notify you of material changes to sub-processors where required
          by law and your agreement.
        </p>
      </Section>

      <Section title="7. International transfers">
        <p>
          Where personal data is transferred outside the UK, we implement appropriate safeguards such
          as the UK International Data Transfer Agreement or Addendum (as applicable) and, where
          relevant, Standard Contractual Clauses, as described in our Privacy Policy.
        </p>
      </Section>

      <Section title="8. Security incidents">
        <p>
          We will notify you without undue delay after becoming aware of a personal data breach
          affecting your data in our custody, where required by UK GDPR, and will provide
          information reasonably available to assist your regulatory or data-subject obligations.
        </p>
      </Section>

      <Section title="9. Enterprise and signed copies">
        <p>
          This web DPA reflects our standard commitment to organisational customers. For procurement
          requiring a countersigned order form or custom schedules, contact{" "}
          <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            jamie@obsidiandynamics.co.uk
          </a>
          .
        </p>
      </Section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
        <Link href="/terms" className="text-accent-blue hover:underline">
          Terms of Service
        </Link>
        <Link href="/privacy" className="text-accent-blue hover:underline">
          Privacy Policy
        </Link>
        <Link href="/pricing" className="text-accent-blue hover:underline">
          Pricing
        </Link>
        <Link href="/dashboard" className="text-accent-blue hover:underline">
          Back to console
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
      <div className="space-y-2">{children}</div>
    </section>
  );
}
