import type { Metadata } from "next";
import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages, softwareApplicationSchema } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Product — Blackglass",
  description:
    "Fleet overview, per-server detail, trusted snapshots, change alerts, optional Charon cloud inventory, exports for reviews, and sensible access roles in one workflow.",
  alternates: { canonical: canonical("/product") },
  openGraph: {
    title: "Product — Blackglass",
    description:
      "Fleet overview, per-server detail, trusted snapshots, change alerts, optional Charon for cloud accounts, shareable reports, and roles that match how real teams work.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/product"),
    images: dynamicOgImages({
      title: "Product tour",
      subtitle: "Fleet overview · trusted snapshots · change alerts · evidence exports",
    }),
  },
};

const clerkOn =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
const signIn = clerkOn ? "/sign-in" : "/login";

const FEATURES = [
  {
    id: "fleet",
    label: "01",
    title: "Fleet overview",
    summary:
      "One calm screen for every Linux host you watch: last check-in, how many open items need attention, and remote-access health at a glance.",
    bullets: [
      "See when each server was last checked and whether we could reach it.",
      "Open items grouped by urgency so the noisy stuff does not drown out what matters.",
      "A simple roll-up of remote-login settings — what is healthy, what needs a look.",
      "Servers that carry the most risk rise to the top automatically.",
      "Click any row to open the full story for that machine.",
    ],
    useCase: null,
  },
  {
    id: "host-detail",
    label: "02",
    title: "Per-server detail",
    summary:
      "Everything about one host in a single place: the snapshot you trust, what changed since then, remote login settings, network listeners, and key services.",
    bullets: [
      "The active trusted snapshot, who captured it, and when.",
      "Open items with plain-language titles, before/after context, and urgency.",
      "The effective remote-login policy as the server actually runs it.",
      "Listening ports compared to what you approved.",
      "Status signals for services you mark as important.",
    ],
    useCase: "/use-cases/ssh-configuration-audit",
    useCaseLabel: "Remote access review →",
  },
  {
    id: "baselines",
    label: "03",
    title: "Trusted snapshots",
    summary:
      "After hardening, a release, or a change freeze, save an approved picture of a host. Every future check compares live state to that moment.",
    bullets: [
      "Capture from the console or your automation — your choice.",
      "Each snapshot remembers who saved it and when.",
      "Older snapshots stay available when you need to look back.",
      "On larger plans, optional approval steps before a snapshot goes live.",
      "Compare two points in time side by side to see exactly what moved.",
    ],
    useCase: "/use-cases/linux-hardening-monitoring",
    useCaseLabel: "Keeping hardening on track →",
  },
  {
    id: "drift",
    label: "04",
    title: "Change alerts",
    summary:
      "When a check finds something different from the trusted snapshot, Blackglass opens a tracked item with urgency, detail, and space for your team to respond.",
    bullets: [
      "Urgency levels separate “drop everything” from “note for next week.”",
      "Plain before/after context so you are not guessing what moved.",
      "Assign an owner, pick a due date, leave notes, and close with a short resolution.",
      "Filter by urgency, server, status, and timeframe.",
      "Optional notifications to Slack, email, or any HTTPS endpoint you run.",
    ],
    useCase: "/use-cases/linux-configuration-drift-detection",
    useCaseLabel: "More on continuous checks →",
  },
  {
    id: "charon",
    label: "05",
    title: "Charon (cloud resource hygiene)",
    summary:
      "Optional add-on: connect DigitalOcean, AWS, or Google Cloud with read-scoped credentials. Inventory scans, idle scoring, scan-over-scan diffs, and dismiss/snooze — cleanup stays human-approved when your plan allows live actions.",
    bullets: [
      "Credentials are envelope-encrypted per workspace; the API never returns secrets.",
      "Signed webhook payloads (same HMAC model as drift) when you enable scan notifications.",
      "Deep links into each vendor console from findings so operators land in the right place.",
      "Scheduled scans on eligible plans; rate limits protect both you and vendor APIs.",
      "Technical IAM starters and trust model: operator docs (not legal advice).",
    ],
    useCase: null,
  },
  {
    id: "evidence",
    label: "06",
    title: "Reports you can share",
    summary:
      "Download a dated package for one server or the whole fleet — ideal for leadership updates, customer security reviews, or working with an outside assessor.",
    bullets: [
      "Includes the trusted snapshot, related items, notes, and who exported it.",
      "Written so reviewers outside engineering can follow along.",
      "Scope exports to one server, one environment, or everything in the workspace.",
      "A running log records each export for accountability.",
    ],
    useCase: "/use-cases/linux-hardening-monitoring",
    useCaseLabel: "Hardening story for stakeholders →",
  },
  {
    id: "rbac",
    label: "07",
    title: "Roles that match reality",
    summary:
      "Five roles from read-only guests to full administrators. People who only need to read never count against your paid seats.",
    bullets: [
      "Owners handle billing and membership.",
      "Admins manage people, snapshots, and settings.",
      "Operators run checks, capture snapshots, and work items.",
      "Viewers can read everything — unlimited on paid plans.",
      "Guest auditors get scoped read access for outside partners — also unlimited on paid plans.",
      "Permissions are enforced on the server, not just hidden in the UI.",
    ],
    useCase: null,
  },
];

export default function ProductPage() {
  const productUrl = canonical("/product") ?? "/product";
  const pricingUrl = canonical("/pricing") ?? "/pricing";
  return (
    <main>
        <JsonLd
          id="schema-software-application"
          data={softwareApplicationSchema({ url: productUrl, pricingUrl })}
        />
        <JsonLd
          id="schema-breadcrumb"
          data={breadcrumbSchema([
            { name: "Home", url: "/" },
            { name: "Product", url: "/product" },
          ])}
        />
        {/* Hero */}
        <section className="border-b border-border-subtle px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Product</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
              A single place to trust, check, and explain your Linux configuration story
            </h1>
            <p className="mt-4 text-lg leading-relaxed">
              Blackglass helps teams agree on a known-good moment for each server, watch for
              meaningful change, and package what happened for people who are not logged into the
              console every day — with sensible access control from day one.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
              >
                Explore demo
              </Link>
              <TrialSignupLink className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated">
                Start free trial
              </TrialSignupLink>
              <Link
                href={signIn}
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Feature tour */}
        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-16">
            {FEATURES.map((f) => (
              <article key={f.id} id={f.id} className="scroll-mt-20">
                <div className="flex items-start gap-4">
                  <span className="text-xs font-semibold text-accent-blue">{f.label}</span>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-fg-primary">{f.title}</h2>
                    <p className="mt-3 leading-relaxed">{f.summary}</p>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                      {f.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    {f.useCase && (
                      <p className="mt-4 text-sm">
                        <Link href={f.useCase} className="text-accent-blue hover:underline">
                          {f.useCaseLabel}
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
                <div className="ml-8 mt-6 border-b border-border-subtle" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        {/* Collector model */}
        <section className="border-t border-border-subtle bg-bg-panel/40 px-4 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-semibold text-fg-primary">How we read your servers</h2>
            <p className="mt-3 leading-relaxed text-sm">
              Most teams connect with a read-only path over SSH from our service. If a machine cannot
              be reached that way — for example, it sits on a private network — you can use a small
              helper that sends results to us over HTTPS instead.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                <strong className="text-fg-primary">Connect in (typical):</strong> We use a dedicated
                low-privilege account. Full administrator access is not required.
              </li>
              <li>
                <strong className="text-fg-primary">Send results out (optional):</strong> For
                hard-to-reach hosts, a lightweight helper posts summaries securely when you prefer
                that model.
              </li>
              <li>
                <strong className="text-fg-primary">Built to respect boundaries:</strong> We collect
                the configuration signals needed to spot drift — things like remote-login settings,
                listeners, accounts, privilege rules, scheduled work, installed packages, and selected
                fingerprints. We do not bulk-copy application configs, environment files, or private
                keys.
              </li>
            </ul>
          </div>
        </section>

        {/* Internal links */}
        <section className="px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold text-fg-primary">Explore by use case</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { href: "/use-cases/linux-configuration-drift-detection", label: "Linux configuration drift detection" },
                { href: "/use-cases/ssh-configuration-audit", label: "SSH configuration audit" },
                { href: "/use-cases/linux-hardening-monitoring", label: "Linux hardening monitoring" },
                { href: "/use-cases/cis-benchmark-monitoring", label: "CIS benchmark monitoring" },
                { href: "/guides/how-to-detect-unauthorized-linux-config-changes", label: "Guide: Detect unauthorized changes" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-lg border border-border-default bg-bg-panel px-4 py-3 text-sm hover:border-accent-blue/50 hover:text-fg-primary"
                  >
                    {l.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border-subtle bg-bg-panel/50 px-4 py-14">
          <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-fg-primary">Want to connect a real server?</h2>
              <p className="mt-2 text-sm">
                Try the demo first, then open a workspace when you are ready to point Blackglass at
                your own fleet.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
              >
                Explore demo
              </Link>
              <TrialSignupLink className="rounded-lg border border-border-default bg-bg-base px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated">
                Start free trial
              </TrialSignupLink>
            </div>
          </div>
        </section>
    </main>
  );
}

