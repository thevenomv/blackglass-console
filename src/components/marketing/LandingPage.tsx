import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

function MockConsolePreview() {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border-default bg-bg-panel shadow-elevated"
      role="img"
      aria-label="Illustration of the Blackglass console showing recent changes and server health"
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated px-3">
        <span className="h-2 w-2 rounded-full bg-red-500/70" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-amber-500/70" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-emerald-500/70" aria-hidden="true" />
        <span className="ml-3 text-[10px] font-medium text-fg-faint">Fleet overview</span>
        <span className="ml-auto rounded-full bg-bg-elevated px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-fg-faint">
          preview
        </span>
      </div>
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-fg-faint">Recent changes</p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
            <span className="text-[10px] text-fg-primary">SSH: direct root login enabled</span>
            <span className="ml-auto text-[9px] font-semibold text-red-400">High</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="text-[10px] text-fg-primary">Sudo policy: new file added</span>
            <span className="ml-auto text-[9px] font-semibold text-amber-400">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-border-subtle" aria-hidden="true" />
            <span className="text-[10px] text-fg-muted">Network: new listening port</span>
            <span className="ml-auto text-[9px] text-fg-faint">Info</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded border border-border-subtle bg-bg-base p-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-fg-faint">Remote access health</p>
          <p className="mt-1 text-[10px] text-emerald-400">2 OK · 1 review · 0 urgent</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
            <div className="h-full w-4/5 rounded-full bg-emerald-500/50" />
          </div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base p-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-fg-faint">Servers in view</p>
          <p className="mt-1 text-[10px] text-accent-blue">8 / 8</p>
          <p className="mt-0.5 text-[9px] text-fg-faint">Last check 4 min ago</p>
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
    <>
      <main>
        <section className="border-b border-border-subtle px-4 py-16 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">
                Clarity for Linux teams
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary sm:text-4xl">
                Spot unwanted server changes early — before they become emergencies.
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-fg-muted">
                Blackglass helps you understand what changed on your Linux systems, how serious it is,
                and what to do next. Built for people who care about security and reliability — whether
                or not they live on the command line.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <TrialSignupLink className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover">
                  Start free trial
                </TrialSignupLink>
                <Link
                  href="/demo"
                  className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
                >
                  Explore demo workspace
                </Link>
                <Link
                  href="/demo/sandbox"
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                >
                  Example scenarios
                </Link>
                <Link
                  href="/book"
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                >
                  Book a demo
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-faint">
                <span>Free <Link href="/pricing" className="hover:text-fg-primary">Lab tier</Link> for homelabs · 14-day trial of any paid plan · no credit card</span>
                <span>SSH-first · optional one-line push agent</span>
                <span>Each customer&apos;s data stays separate end to end</span>
              </div>
            </div>
            <MockConsolePreview />
          </div>
        </section>

        <section id="problem" className="scroll-mt-20 px-4 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Why small changes add up</h2>
            <p className="mt-4 max-w-3xl text-fg-muted">
              Rules change. Software updates. Someone adjusts remote login settings. Spreadsheets and
              occasional audits often miss the period when risk actually moves. Blackglass gives you a
              steady, easy-to-read picture — whether you run a handful of servers or many.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "You only hear about drift when something breaks — or when an auditor asks.",
                "Inconsistent lockdown across machines makes it hard to see how far a problem could spread.",
                "Emergency fixes can leave one-off servers no one fully understands.",
                "Security reviews need a paper trail — not screenshots lost in chat.",
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

        <section id="product" className="scroll-mt-20 border-t border-border-subtle bg-bg-panel/40 px-4 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">How it works</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "01",
                  title: "Connect your servers",
                  body: "Link Linux hosts with a light-touch setup you control — nothing shipped to us beyond what you choose to share.",
                },
                {
                  step: "02",
                  title: "Save a trusted snapshot",
                  body: "After a release or hardening pass, pin an approved picture of each system so you have something to compare against.",
                },
                {
                  step: "03",
                  title: "See what changed",
                  body: "Regular checks highlight differences in remote access, accounts, scheduled tasks, software, and more — ranked so the important items stand out.",
                },
                {
                  step: "04",
                  title: "Respond with confidence",
                  body: "Track who is handling each item, add notes, and export neat summaries for leadership or compliance partners.",
                },
              ].map((s) => (
                <li key={s.step} className="rounded-lg border border-border-default bg-bg-base p-4">
                  <span className="text-xs font-semibold text-accent-blue">{s.step}</span>
                  <h3 className="mt-2 font-semibold text-fg-primary">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Try it without risk</h2>
            <p className="mt-3 max-w-2xl text-fg-muted">
              Walk through a sample workspace with made-up data — same screens and flows you get with a
              real account.
            </p>
            <p className="mt-6">
              <Link
                href="/demo"
                className="inline-block rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
              >
                Open interactive demo →
              </Link>
            </p>
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold text-fg-primary">Security and trust</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Strong separation between customers at every layer of the service.",
                "Enterprise-ready sign-in: single sign-on, automated user provisioning, and multi-factor authentication where you need it.",
                "Credentials are protected with encryption designed for cloud services — keys managed the way your security team expects.",
                "A detailed record of important actions, with exports you can archive or hand to an assessor.",
                "Signed notifications to your own tools so you can trust what arrived from us.",
                "Deployments available for highly regulated environments, including disconnected networks.",
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
                Technical security overview →
              </Link>
            </p>
          </div>
        </section>

        <section className="border-t border-border-subtle bg-bg-panel/50 px-4 py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold text-fg-primary">Ready when you are</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Start with the tour, then connect your own servers whenever the time feels right.
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
            Already using Blackglass?{" "}
            <Link href={signIn} className="text-accent-blue hover:underline">
              Sign in
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
