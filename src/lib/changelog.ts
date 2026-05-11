/**
 * Source of truth for changelog entries — consumed by both the public
 * `/changelog` page (rendered as cards) and `/changelog/feed.xml` (RSS).
 *
 * Curate user-visible improvements here (NOT raw git log). Group by
 * release / month so prospects see a steady cadence of shipped work
 * without drowning in commit noise. Newest first.
 *
 * When adding entries, prefer "what changed for the operator" over "what
 * changed in the code". A great entry tells the user what they can do
 * now that they couldn't before, or what regression they no longer have
 * to worry about.
 *
 * Public-facing constraint: do NOT broadcast pricing-tier changes here
 * (looks needy / in flux to prospects). Pricing belongs at /pricing.
 */
export type ChangelogKind = "feature" | "fix" | "security" | "perf";

export interface ChangelogHighlight {
  readonly kind: ChangelogKind;
  readonly text: string;
}

export interface ChangelogEntry {
  readonly version: string;
  /**
   * ISO date `YYYY-MM-DD` for the entry. Renderers format this as needed
   * (the page shows "May 10, 2026", the RSS feed emits RFC 822 with a
   * stable noon-UTC timestamp so the feed is reproducible).
   */
  readonly date: string;
  readonly highlights: ReadonlyArray<ChangelogHighlight>;
}

export const CHANGELOG_ENTRIES: ReadonlyArray<ChangelogEntry> = [
  {
    version: "2026.05.c",
    date: "2026-05-10",
    highlights: [
      {
        kind: "feature",
        text: "Charon (cloud janitor): link DO / AWS / GCP read credentials, run idle-resource scans, review findings, request cleanups, suppress noise, and wire scan webhooks — all from the Charon console.",
      },
      {
        kind: "feature",
        text: "Charon policies and scheduled scans run through the ops worker queue; entitlements enforced through per-workspace plan and add-ons.",
      },
      {
        kind: "security",
        text: "Credential JSON validated with Zod before storage; outbound scan webhooks carry a versioned envelope for safer integration.",
      },
    ],
  },
  {
    version: "2026.05.b",
    date: "2026-05-09",
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
    date: "2026-05-01",
    highlights: [
      {
        kind: "feature",
        text: "Structured \"talk to sales\" lead capture — replaces the previous mailto: handoff with an in-app form, Slack + email fan-out, and full audit-log capture.",
      },
    ],
  },
  {
    version: "2026.04",
    date: "2026-04-30",
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
    date: "2026-03-31",
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

export const CHANGELOG_KIND_LABEL: Record<ChangelogKind, string> = {
  feature: "New",
  fix: "Fix",
  security: "Security",
  perf: "Performance",
};

/** Format an ISO date as the human-friendly form shown on the changelog page. */
export function formatChangelogDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
