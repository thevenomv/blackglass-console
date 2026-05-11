import type { Metadata } from "next";
import { ContactSalesForm } from "@/components/marketing/ContactSalesForm";
import { breadcrumbSchema, canonical, defaultOgImages, defaultTwitterImages } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "Contact Sales · Blackglass",
  description:
    "Tell us about your fleet and how you'd like to use Blackglass. We typically reply within one business day.",
  alternates: { canonical: canonical("/contact-sales") },
  openGraph: {
    title: "Contact Sales · Blackglass",
    description:
      "Tell us about your fleet and how you'd like to use Blackglass. We typically reply within one business day.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/contact-sales"),
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Sales · Blackglass",
    description:
      "Tell us about your fleet and how you'd like to use Blackglass. We typically reply within one business day.",
    images: defaultTwitterImages(),
  },
};

export default function ContactSalesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Contact Sales", url: "/contact-sales" },
        ])}
      />
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-blue">
          Enterprise
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-fg-primary">Talk to sales</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Tell us about your fleet, your compliance regime, and how you&apos;d like to use
          Blackglass. We typically reply within one business day. For urgent help,
          email{" "}
          <a className="text-accent-blue hover:underline" href="mailto:jamie@obsidiandynamics.co.uk">
            jamie@obsidiandynamics.co.uk
          </a>
          {" "}or{" "}
          <a className="text-accent-blue hover:underline" href="/book">
            book a 30-minute walkthrough
          </a>
          .
        </p>
      </header>

      <ContactSalesForm />

      <section className="mt-12 rounded-card border border-border-default bg-bg-panel p-6 text-sm text-fg-muted">
        <h2 className="mb-2 text-sm font-semibold text-fg-primary">What you&rsquo;ll get</h2>
        <ul className="space-y-1.5 text-xs leading-relaxed">
          <li>· A scoping call covering fleet topology, compliance posture, and onboarding plan</li>
          <li>· Pricing tailored to your seat / host count and retention requirements</li>
          <li>· A draft Master Service Agreement and DPA on request</li>
          <li>· Self-hosted / air-gap evaluation pack if your security team needs one</li>
        </ul>
      </section>
    </main>
  );
}
