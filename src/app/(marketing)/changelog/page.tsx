import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog · Blackglass",
  description:
    "What's new in Blackglass — recent releases, security fixes, and product polish.",
  openGraph: {
    title: "Changelog · Blackglass",
    description:
      "What's new in Blackglass — recent releases, security fixes, and product polish.",
    type: "article",
    siteName: "Blackglass",
  },
  twitter: {
    card: "summary",
    title: "Changelog · Blackglass",
    description:
      "What's new in Blackglass — recent releases, security fixes, and product polish.",
  },
};

/**
 * Changelog source-of-truth.
 *
 * Curate user-visible improvements here (NOT raw git log). Group by
 * release / month so prospects can see a steady cadence of shipped
 * work without drowning in commit noise. Newest first.
 *
 * When adding entries, prefer "what changed for the operator" over
 * "what changed in the code". A great entry tells the user what they
 * can do now that they couldn't before, or what regression they no
 * longer have to worry about.
 */
const ENTRIES: ReadonlyArray<{
  version: string;
  date: string;
  highlights: ReadonlyArray<{ kind: "feature" | "fix" | "security" | "perf"; text: string }>;
}> = [
  {
    version: "2026.05.c",
    date: "May 10, 2026",
    highlights: [
      {
        kind: "feature",
        text: "Charon (cloud janitor): link DO / AWS / GCP read credentials, run idle-resource scans, review findings, request cleanups, suppress noise, and wire scan webhooks — all from the new Janitor console.",
      },
      {
        kind: "feature",
        text: "Janitor policies and scheduled scans run through the ops worker queue; Stripe add-on entitlements gate Charon for Growth+ plans.",
      },
      {
        kind: "security",
        text: "Credential JSON validated with Zod before storage; outbound scan webhooks carry a versioned envelope for safer integration.",
      },
    ],
  },
  {
    version: "2026.05.b",
    date: "May 9, 2026",
    highlights: [
      {
        kind: "feature",
        text: "Run-scan now waits up to 90s for the next push-agent snapshot when SSH is unavailable, so drift introduced seconds before the click is detected on the first scan instead of the next one.",
      },
      {
        kind: "feature",
        text: "Snapshot-freshness pill on the dashboard shows how recent the latest fleet signal is at a glance, with green/amber/red thresholds.",
      },
      {
        kind: "feature",
        text: "Onboarding wizard surfaces the live collector status (\"Waiting for fresh agent snapshot…\") so first-scan flows feel transparent rather than stalled.",
      },
      {
        kind: "perf",
        text: "Default push-agent cadence reduced from 5 minutes to 60 seconds (systemd timer + cron fallback). Every scan now reflects state captured within the last minute.",
      },
      {
        kind: "fix",
        text: "Scan-job projection no longer fakes a \"succeeded\" status for real scans before the collector resolves them — the dashboard refresh now lines up with actual drift events.",
      },
      {
        kind: "fix",
        text: "Multi-instance scan tracking: scan kind + progress now persist to Redis, so a poll routed to a different web container still sees the right state.",
      },
    ],
  },
  {
    version: "2026.05.a",
    date: "May 1, 2026",
    highlights: [
      {
        kind: "feature",
        text: "New six-tier pricing ladder — Lab (free), Starter, Growth, Scale, Business, Enterprise — plus a Remediator (HITL AI) add-on slot.",
      },
      {
        kind: "feature",
        text: "Enterprise \"Talk to sales\" CTA now opens a structured lead form with Slack + email fan-out and full audit-log capture.",
      },
      {
        kind: "feature",
        text: "Stripe checkout supports Scale tier and inline-fallback pricing for fresh deployments where price IDs aren't wired yet.",
      },
    ],
  },
  {
    version: "2026.04",
    date: "April 2026",
    highlights: [
      {
        kind: "feature",
        text: "Bulletproof first-baseline experience — onboarding wizard recovers cleanly from SSH timeouts, mid-flow errors, and stuck queues.",
      },
      {
        kind: "feature",
        text: "Host tombstones: deleted hosts no longer reappear from a stale agent push; bulk delete + undo windows make cleanup safe.",
      },
      {
        kind: "feature",
        text: "Async baseline jobs — long-running fleet baselines run in BullMQ with live progress, freeing up the API for interactive scans.",
      },
      {
        kind: "feature",
        text: "Push-mode agent + bundle-ingest route + lab-health agent freshness probe — the foundation for blackholed-host coverage.",
      },
      {
        kind: "fix",
        text: "Drift compute on every push instead of overwriting the baseline, so silent drift can't sneak in between scans.",
      },
      {
        kind: "fix",
        text: "PDF report generators sanitise Unicode glyphs before draw, eliminating the \"missing glyph\" boxes in compliance evidence bundles.",
      },
    ],
  },
  {
    version: "2026.03",
    date: "March 2026",
    highlights: [
      {
        kind: "security",
        text: "BYOK Phase 2/3 — encryption-key rotation + per-tenant KMS bindings, with airgap probe wiring for self-hosted deployments.",
      },
      {
        kind: "security",
        text: "Approval Token enforcement is now default-on for Remediator HITL actions; matrix tests cover all sudo / non-sudo combinations.",
      },
      {
        kind: "security",
        text: "Per-tenant scan rate-limit + tenant-leak RLS test prevents cross-tenant signal contamination in noisy multi-tenant deployments.",
      },
      {
        kind: "feature",
        text: "Drift-digest email summarises new findings on a daily cadence; CEF integration note + Playwright win32 visual baselines added.",
      },
      {
        kind: "feature",
        text: "Helm chart ships sandbox-worker, with lab-health probe + drift-digest UI + collector port pinned at 22.",
      },
    ],
  },
];

const KIND_LABEL: Record<"feature" | "fix" | "security" | "perf", string> = {
  feature: "New",
  fix: "Fix",
  security: "Security",
  perf: "Performance",
};

const KIND_CLASS: Record<"feature" | "fix" | "security" | "perf", string> = {
  feature: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  fix: "border-success/30 bg-success-soft/30 text-success",
  security: "border-danger/30 bg-danger-soft/30 text-danger",
  perf: "border-warning/30 bg-warning-soft/30 text-warning",
};

export default function ChangelogPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-blue">
          Product
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-fg-primary">Changelog</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">
          What we&rsquo;ve shipped recently. We release small improvements continuously
          and group user-visible changes here for easier scanning. Want a deeper dive?{" "}
          <Link className="text-accent-blue hover:underline" href="/contact-sales">
            Ask us about a specific change
          </Link>
          .
        </p>
      </header>

      <div className="space-y-10">
        {ENTRIES.map((entry) => (
          <article
            key={entry.version}
            className="rounded-card border border-border-default bg-bg-panel p-6"
          >
            <header className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-fg-primary">
                {entry.version}
              </h2>
              <p className="text-xs text-fg-faint">{entry.date}</p>
            </header>
            <ul className="space-y-3">
              {entry.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-fg-muted">
                  <span
                    className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md border px-2 text-[10px] font-medium uppercase tracking-wider ${KIND_CLASS[h.kind]}`}
                  >
                    {KIND_LABEL[h.kind]}
                  </span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <footer className="mt-12 rounded-card border border-border-default bg-bg-panel/50 p-4 text-center text-xs text-fg-faint">
        Subscribed to a previous version? Email{" "}
        <a className="text-accent-blue hover:underline" href="mailto:jamie@obsidiandynamics.co.uk">
          jamie@obsidiandynamics.co.uk
        </a>
        {" "}and we&rsquo;ll loop you back into release notifications.
      </footer>
    </main>
  );
}
