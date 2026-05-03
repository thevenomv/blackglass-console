import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";
import { COMMERCIAL_PLANS, TRIAL_DAYS, TRIAL_HOST_LIMIT, TRIAL_PAID_SEAT_LIMIT } from "@/lib/saas/plans";

function MockConsolePreview() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border-default bg-bg-panel shadow-elevated">
      <div className="flex h-8 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated px-3">
        <span className="h-2 w-2 rounded-full bg-red-500/70" />
        <span className="h-2 w-2 rounded-full bg-amber-500/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
        <span className="ml-3 font-mono text-[10px] text-fg-faint">blackglass / fleet</span>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        <div className="rounded border border-border-subtle bg-bg-base p-2 sm:col-span-2">
          <p className="font-mono text-[9px] text-fg-faint">Drift queue</p>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-4/5 rounded bg-red-500/25" />
            <div className="h-2 w-3/5 rounded bg-amber-500/20" />
            <div className="h-2 w-2/3 rounded bg-border-subtle" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="rounded border border-border-subtle bg-bg-base p-2">
            <p className="font-mono text-[9px] text-fg-faint">SSH</p>
            <div className="mt-1 h-8 rounded bg-emerald-500/10" />
          </div>
          <div className="rounded border border-border-subtle bg-bg-base p-2">
            <p className="font-mono text-[9px] text-fg-faint">Hosts</p>
            <div className="mt-1 h-6 rounded bg-accent-blue/15" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const clerkOn =
    typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
  const signIn = clerkOn ? "/sign-in" : "/login";

  return (
    <div className="min-h-screen bg-bg-base text-fg-muted">
      <MarketingNav />
      <main>
        <section className="border-b border-border-subtle px-4 py-16 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
                Linux server integrity
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary sm:text-4xl">
                Know when your SSH posture and baselines drift — before an auditor does.
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-fg-muted">
                BLACKGLASS captures approved configuration baselines across your fleet, detects
                meaningful drift (including sshd and listener surface), and keeps remediation work
                traceable — without scraping secrets or file contents from hosts.
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
                  href="/book"
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                >
                  Book walkthrough
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-faint">
                <span>No credit card for trial</span>
                <span>Unlimited viewers on paid plans</span>
                <span>Built for ops &amp; security teams</span>
              </div>
            </div>
            <MockConsolePreview />
          </div>
        </section>

        <section id="problem" className="scroll-mt-20 px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Why drift matters</h2>
            <p className="mt-4 max-w-3xl text-fg-muted">
              Firewall rules change. Packages update. Someone toggles <code className="font-mono text-accent-blue">PermitRootLogin</code>.{" "}
              Manual spreadsheets and quarterly scans miss the window where risk actually changes.
              Small teams need the same signal clarity as multi-region fleets — without another
              heavyweight CMDB project.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "SSH misconfiguration and new listeners are common blast-radius multipliers.",
                "Ad-hoc fixes without baselines create “snowflake” hosts nobody can explain.",
                "Compliance asks for evidence — screenshots in Slack threads do not scale.",
              ].map((t) => (
                <li
                  key={t}
                  className="rounded-lg border border-border-default bg-bg-panel px-4 py-3 text-sm leading-relaxed"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="product" className="scroll-mt-20 border-t border-border-subtle bg-bg-panel/40 px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">How it works</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "01",
                  title: "Connect hosts",
                  body: "Agentless SSH collection scoped to metadata you approve — no secret exfiltration.",
                },
                {
                  step: "02",
                  title: "Freeze baselines",
                  body: "Pin known-good snapshots after change freezes or releases.",
                },
                {
                  step: "03",
                  title: "Detect drift",
                  body: "Surface sshd, sysctl, user/listener deltas with severity — not noisy noise.",
                },
                {
                  step: "04",
                  title: "Remediate &amp; prove",
                  body: "Track acknowledgement, ownership, and export audit-ready bundles.",
                },
              ].map((s) => (
                <li key={s.step} className="rounded-lg border border-border-default bg-bg-base p-4">
                  <span className="font-mono text-xs text-accent-blue">{s.step}</span>
                  <h3 className="mt-2 font-semibold text-fg-primary">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Product proof</h2>
            <p className="mt-3 max-w-2xl text-fg-muted">
              Representative panels — explore the interactive sample workspace for a navigable
              walkthrough (still fictional data).
            </p>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {[
                {
                  title: "Drift finding",
                  sample: "sshd PermitRootLogin=yes vs baseline prohibit-password",
                  meta: "High · SSH · new",
                },
                {
                  title: "SSH audit excerpt",
                  sample: "MACs + KexAlgorithms vs CIS profile for Ubuntu 22.04",
                  meta: "2 fails · 4 warns",
                },
                {
                  title: "Remediation",
                  sample: "Jump host hardening ticket — owner platform@… · due Friday",
                  meta: "In progress",
                },
              ].map((c) => (
                <div key={c.title} className="rounded-lg border border-border-default bg-bg-panel p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-faint">
                    {c.title}
                  </p>
                  <p className="mt-3 text-sm text-fg-primary">{c.sample}</p>
                  <p className="mt-2 font-mono text-[10px] text-fg-faint">{c.meta}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center">
              <Link href="/demo" className="text-sm font-medium text-accent-blue hover:underline">
                Open interactive demo →
              </Link>
            </p>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-t border-border-subtle px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Pricing preview</h2>
            <p className="mt-3 max-w-2xl text-fg-muted">
              We charge for <strong className="text-fg-primary">operator capacity</strong> (owner /
              admin / operator seats) and <strong className="text-fg-primary">host volume</strong>.
              Read-only viewers and guest auditors are always unlimited on paid plans.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.values(COMMERCIAL_PLANS).map((p) => (
                <div
                  key={p.code}
                  className="rounded-lg border border-border-default bg-bg-panel p-4"
                >
                  <p className="font-mono text-xs font-semibold text-accent-blue">{p.label}</p>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-fg-primary">
                    {p.hostLimit} hosts
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{p.paidSeatLimit} paid seats</p>
                  <p className="mt-3 text-xs text-fg-faint">Unlimited viewers</p>
                </div>
              ))}
              <div className="rounded-lg border border-border-default bg-bg-panel p-4">
                <p className="font-mono text-xs font-semibold text-accent-blue">Enterprise</p>
                <p className="mt-3 text-sm text-fg-primary">Custom hosts, seats, SSO, and contracts.</p>
                <Link href="/book" className="mt-3 inline-block text-sm text-accent-blue hover:underline">
                  Talk to us
                </Link>
              </div>
            </div>
            <div className="mt-8 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100">
              <strong className="text-amber-50">Free trial:</strong> {TRIAL_DAYS} days · up to{" "}
              {TRIAL_HOST_LIMIT} hosts · {TRIAL_PAID_SEAT_LIMIT} paid seats · no card required. After
              trial: workspace stays readable; operational actions lock until you upgrade (no
              permanent free operational tier).
            </div>
            <p className="mt-6">
              <Link href="/pricing" className="text-sm font-medium text-accent-blue hover:underline">
                Full pricing page →
              </Link>
            </p>
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Security &amp; trust</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Tenant-isolated workspace data in PostgreSQL; app roles enforced server-side — never from the browser alone.",
                "Clerk-hosted authentication with mandatory MFA; optional step-up for sensitive mutations.",
                "Audit trail for invites, scans, baseline changes, and billing-related events.",
                "TLS in transit; least-privilege collector semantics — no harvesting of env vars or private keys into BLACKGLASS storage.",
              ].map((t) => (
                <li
                  key={t}
                  className="rounded-lg border border-border-default bg-bg-panel px-4 py-3 text-sm leading-relaxed"
                >
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm">
              <Link href="/security" className="font-medium text-accent-blue hover:underline">
                Read security overview →
              </Link>
            </p>
          </div>
        </section>

        <section className="border-t border-border-subtle bg-bg-panel/50 px-4 py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold text-fg-primary">See the console on real data</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Start with the demo, then provision a workspace when you are ready to connect hosts.
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
          <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-fg-faint">
            Already using BLACKGLASS?{" "}
            <Link href={signIn} className="text-accent-blue hover:underline">
              Sign in to console
            </Link>{" "}
            (<Link href="/dashboard" className="text-accent-blue hover:underline">/dashboard</Link>).
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
