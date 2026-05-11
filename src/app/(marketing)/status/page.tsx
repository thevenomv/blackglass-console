import type { Metadata } from "next";
import { StatusBoard } from "@/components/marketing/StatusBoard";
import { canonical, defaultOgImages, defaultTwitterImages } from "@/lib/seo";

export const metadata: Metadata = {
  title: "System status · Blackglass",
  description:
    "Live status of Blackglass console, API, database, queue, and object store. Updated every 30 seconds.",
  alternates: { canonical: canonical("/status") },
  openGraph: {
    title: "System status · Blackglass",
    description:
      "Live status of Blackglass console, API, database, queue, and object store. Updated every 30 seconds.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/status"),
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: "System status · Blackglass",
    description:
      "Live status of Blackglass console, API, database, queue, and object store.",
    images: defaultTwitterImages(),
  },
};

export default function StatusPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-blue">
          System status
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-fg-primary">Is Blackglass up?</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">
          Live health of every component the console depends on. Pulled directly from
          the production process — no static dashboards, no third-party uptime trackers
          that can lie to you. Refreshes every 30 seconds.
        </p>
      </header>

      <StatusBoard />

      <section className="mt-12 rounded-card border border-border-default bg-bg-panel/50 p-4 text-xs leading-relaxed text-fg-muted">
        Want a heads-up the moment something goes red? Subscribe via{" "}
        <a className="text-accent-blue hover:underline" href="mailto:jamie@obsidiandynamics.co.uk?subject=Status%20notifications%20please">
          jamie@obsidiandynamics.co.uk
        </a>
        {" "}— we&rsquo;ll add you to the incident list. For ongoing reliability questions
        the{" "}
        <a className="text-accent-blue hover:underline" href="/changelog">
          changelog
        </a>
        {" "}lists every shipped fix.
      </section>
    </main>
  );
}
