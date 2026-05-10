import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "Free tools for Linux & cloud teams — Blackglass";
const DESCRIPTION =
  "Estimate cloud waste, score Linux drift risk, and visualise inventory diffs. Browser-based, no API keys, no signup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    images: [{ url: "/og-tools.png", width: 1200, height: 630, alt: "Blackglass Tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-tools.png"],
  },
};

type ToolStatus = "live" | "preview";

interface ToolCard {
  href: string;
  title: string;
  status: ToolStatus;
  blurb: string;
  bullets: string[];
  productLink: { href: string; label: string };
}

const TOOLS: ToolCard[] = [
  {
    href: "/tools/cloud-waste-estimator",
    title: "Cloud Waste Estimator",
    status: "live",
    blurb:
      "Pre-scan planning tool for cloud waste — estimate idle compute, ghost volumes, and old snapshots from rough counts. Entirely client-side, no credentials.",
    bullets: [
      "Inputs: rough counts per provider (DO, AWS, GCP).",
      "Outputs: monthly waste range with a low/medium/high band.",
      "Includes a downloadable cleanup checklist.",
    ],
    productLink: {
      href: "/product#charon",
      label: "Charon does this for real with safe approvals →",
    },
  },
  {
    href: "/tools/linux-drift-risk",
    title: "Linux Drift Risk Score",
    status: "live",
    blurb:
      "Five-question score that maps your Linux change-control posture to the drift classes most worth watching.",
    bullets: [
      "Inputs: distros, config management, SSH key process, audit needs.",
      "Outputs: a 0–100 risk score with the top three drift classes for your shape.",
      "No data collected — runs locally in the browser.",
    ],
    productLink: {
      href: "/product",
      label: "Blackglass turns drift into evidence →",
    },
  },
  {
    href: "/tools/cloud-inventory-diff",
    title: "Cloud Inventory Diff Visualiser",
    status: "live",
    blurb:
      "Drop two JSON inventory exports and see what was added, removed, or changed — useful for one-off sanity checks.",
    bullets: [
      "Inputs: two inventory exports in our simple JSON shape.",
      "Outputs: a categorised diff with per-resource highlights.",
      "Files stay in your browser; nothing is uploaded.",
    ],
    productLink: {
      href: "/product#charon",
      label: "Charon snapshots inventory automatically →",
    },
  },
];

export default function ToolsIndexPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:py-14">
      <section aria-label="Tools list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCardView key={tool.href} tool={tool} />
        ))}
      </section>

      <section
        aria-labelledby="tools-context"
        className="mt-12 rounded-card border border-border-default bg-bg-panel px-6 py-6 text-sm leading-relaxed"
      >
        <h2 id="tools-context" className="text-base font-semibold text-fg-primary">
          How these fit with the product
        </h2>
        <p className="mt-2 text-fg-muted">
          These are pre-scan planning tools — same mental model as Blackglass and Charon, with
          rough self-reported inputs instead of live scans. They never request credentials,
          hostnames, or live resource identifiers. You get a defensible starting point in a few
          minutes, without signup.
        </p>
        <p className="mt-3 text-fg-muted">
          When you&rsquo;re ready for the real thing, there&rsquo;s a clear path:
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-fg-muted">
          <li>
            <span className="text-fg-primary">Free estimator</span> here on `/tools` — no signup.
          </li>
          <li>
            <span className="text-fg-primary">Optional emailed report</span> from any tool that
            supports it.
          </li>
          <li>
            <Link
              href="/demo?source=tools-index"
              className="text-accent-blue hover:underline"
            >
              Sample Blackglass workspace
            </Link>{" "}
            — explore a fully populated console without connecting anything.
          </li>
          <li>
            <Link href="/product" className="text-accent-blue hover:underline">
              Real scans in Blackglass and Charon
            </Link>
            , with encrypted credentials, signed webhooks, and approval-gated cleanup. Trust
            details live in the{" "}
            <Link href="/security" className="text-accent-blue hover:underline">
              security overview
            </Link>
            .
          </li>
        </ol>
      </section>
    </main>
  );
}

function ToolCardView({ tool }: { tool: ToolCard }) {
  const isLive = tool.status === "live";
  return (
    <article
      className="flex h-full flex-col rounded-card border border-border-default bg-bg-panel p-5 transition-colors hover:border-accent-blue/50"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg-primary">{tool.title}</h2>
        <StatusPill status={tool.status} />
      </header>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{tool.blurb}</p>
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-fg-muted">
        {tool.bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 text-fg-faint">
              –
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-1 flex-col justify-end gap-2">
        <Link
          href={tool.href}
          className={
            isLive
              ? "inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-2 text-xs font-medium text-white hover:bg-accent-blue-hover"
              : "inline-flex items-center justify-center rounded-md border border-border-default bg-bg-base px-3 py-2 text-xs font-medium text-fg-primary hover:bg-bg-elevated"
          }
        >
          {isLive ? "Open tool" : "View preview"}
        </Link>
        <Link
          href={tool.productLink.href}
          className="text-xs text-accent-blue hover:underline"
        >
          {tool.productLink.label}
        </Link>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: ToolStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
      Preview
    </span>
  );
}
