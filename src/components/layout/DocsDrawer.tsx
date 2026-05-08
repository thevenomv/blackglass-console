"use client";

/**
 * In-app docs drawer.
 *
 * A floating "?" trigger at the bottom-right of every (app) page opens a
 * right-side slide-out panel with content for the current route. Content
 * is keyed by pathname so navigating between pages updates the body
 * without re-opening.
 *
 * Future iteration can swap the inline `TOPICS` map for MDX served from
 * a docs API route; the drawer surface stays identical.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface DocTopic {
  /** Slug used to match against the current pathname prefix. */
  match: string[];
  title: string;
  blurb: string;
  bullets: { heading: string; body: string }[];
  /** Optional follow-up links rendered at the bottom of the drawer. */
  links?: { href: string; label: string }[];
}

const TOPICS: DocTopic[] = [
  {
    match: ["/dashboard"],
    title: "Fleet dashboard",
    blurb:
      "Top-down view of fleet integrity. Use the trend chart to spot drift waves; the open-findings panel surfaces what to triage next.",
    bullets: [
      {
        heading: "Run a scan",
        body: "The Run scan button collects fresh state from every connected host and computes the diff against each host's baseline.",
      },
      {
        heading: "Open findings",
        body: "Each card links into the drift event itself. Triage from there or use the bulk-action toolbar in /drift.",
      },
    ],
    links: [
      { href: "/drift", label: "Open the full drift list" },
      { href: "/baselines", label: "Manage baselines" },
    ],
  },
  {
    match: ["/drift"],
    title: "Triaging findings",
    blurb:
      "Findings are changes compared with your trusted snapshot, grouped by type so you can filter and bulk-update.",
    bullets: [
      {
        heading: "Lifecycle states",
        body: "new → triaged → accepted_risk / remediated / verified. Bulk-update via the toolbar after multi-select.",
      },
      {
        heading: "Accept as baseline",
        body: "If an event reflects an authorised change, the bulk action recaptures the host's snapshot as the new baseline so it stops appearing.",
      },
      {
        heading: "Snooze noisy classes",
        body: "Mute rules in Settings let you suppress matching titles for a window — useful for noisy categories during a change window.",
      },
    ],
    links: [
      { href: "/baselines", label: "Inspect the underlying baselines" },
      { href: "/evidence", label: "Bundle for audit" },
    ],
  },
  {
    match: ["/baselines"],
    title: "Baselines",
    blurb:
      "A baseline is a trusted snapshot of a host that future scans diff against. Capture one when the host is in a known-good state.",
    bullets: [
      {
        heading: "When to recapture",
        body: "After an authorised change (deploy, patch, config rollout). Until you do, every change shows up as drift.",
      },
      {
        heading: "Per-host baselines",
        body: "Each host has its own baseline. Use the host switcher above to jump between them.",
      },
    ],
    links: [{ href: "/hosts", label: "View host inventory" }],
  },
  {
    match: ["/evidence"],
    title: "Evidence bundles",
    blurb:
      "Tamper-evident packets containing baselines, drift findings, acknowledgements, and operator notes — accepted for SOC 2, post-incident review, and CAB submissions.",
    bullets: [
      {
        heading: "What's included",
        body: "Baseline metadata + every drift event in the chosen scope + the audit log entries that touched them, all hashed and signed.",
      },
      {
        heading: "CIS controls tab",
        body: "Map your CIS Controls (or any framework) to drift categories so an auditor can trace coverage from a control to the underlying detection.",
      },
    ],
    links: [{ href: "/audit", label: "View the audit log" }],
  },
  {
    match: ["/reports"],
    title: "Reports",
    blurb:
      "Periodic rollups of drift findings, scan health, and remediation throughput. Useful for change windows, exec summaries, and compliance evidence.",
    bullets: [
      {
        heading: "Generate vs schedule",
        body: "Generate a one-off from the current state, or schedule recurring reports — they auto-include the most recent fleet scan.",
      },
    ],
  },
  {
    match: ["/hosts"],
    title: "Hosts",
    blurb:
      "Inventory of every host the collector reaches. Per-host trust pill summarises the latest scan health.",
    bullets: [
      {
        heading: "Add a host",
        body: "Settings → Collector hosts. After adding, hit Test SSH on the row to verify the credential before relying on the next scheduled scan.",
      },
    ],
    links: [{ href: "/settings", label: "Open settings" }],
  },
  {
    match: ["/audit"],
    title: "Audit log",
    blurb:
      "Tenant-scoped record of every action that touched this workspace — auth, scans, baseline accepts, member changes, etc.",
    bullets: [
      {
        heading: "Filter by actor",
        body: "Type any user id into the actor filter to see exactly what they did. Useful for incident reconstruction.",
      },
      {
        heading: "Export",
        body: "Combine with Settings → Data export to pull the audit log into your own SIEM or warehouse.",
      },
    ],
  },
  {
    match: ["/settings"],
    title: "Settings",
    blurb:
      "All workspace configuration in one place. Sections are gated by role — viewers see most read-only, owner+admin can edit everything.",
    bullets: [
      {
        heading: "Runtime health",
        body: "Live rate-limit + queue depth. Useful when a scheduled scan didn't fire or webhooks aren't landing.",
      },
      {
        heading: "Data export & retention",
        body: "Per-tenant data portability + automatic pruning policies. Both run on the ops-worker process.",
      },
    ],
  },
];

const DEFAULT_TOPIC: DocTopic = {
  match: [],
  title: "Blackglass help",
  blurb:
    "Quick reference for the page you're on. The drawer updates as you navigate.",
  bullets: [
    {
      heading: "Why this is here",
      body: "Most page-specific guidance lives behind /docs in production. The drawer surfaces the high-leverage bits without leaving the app.",
    },
  ],
};

function topicForPath(pathname: string): DocTopic {
  // Pick the most specific match (longest prefix). Falls back to default
  // for routes that haven't been documented yet.
  let best: DocTopic | null = null;
  let bestLen = 0;
  for (const topic of TOPICS) {
    for (const m of topic.match) {
      if (pathname === m || pathname.startsWith(`${m}/`)) {
        if (m.length > bestLen) {
          best = topic;
          bestLen = m.length;
        }
      }
    }
  }
  return best ?? DEFAULT_TOPIC;
}

export function DocsDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const topic = useMemo(() => topicForPath(pathname ?? "/"), [pathname]);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape, like a modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close docs drawer" : "Open docs drawer"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 hidden h-10 w-10 items-center justify-center rounded-full border border-border-default bg-bg-panel text-fg-muted shadow-elevated transition-colors hover:border-accent-blue hover:text-accent-blue md:flex"
        title="Page help (?)"
      >
        <span className="text-base font-semibold">?</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={`${topic.title} — page help`}
          className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[90vw] flex-col border-l border-border-default bg-bg-panel shadow-elevated"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                Page help
              </p>
              <h2 className="mt-0.5 text-sm font-semibold text-fg-primary">
                {topic.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close docs drawer"
              className="shrink-0 rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
            >
              Close
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-sm leading-relaxed text-fg-muted">{topic.blurb}</p>

            <div className="mt-4 space-y-3">
              {topic.bullets.map((b) => (
                <section
                  key={b.heading}
                  className="rounded-card border border-border-subtle bg-bg-base px-3 py-2.5"
                >
                  <p className="text-xs font-semibold text-fg-primary">{b.heading}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{b.body}</p>
                </section>
              ))}
            </div>

            {topic.links && topic.links.length > 0 ? (
              <div className="mt-5 border-t border-border-subtle pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                  Jump to
                </p>
                <ul className="mt-2 space-y-1">
                  {topic.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-xs text-accent-blue hover:underline"
                        onClick={close}
                      >
                        {l.label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <footer className="border-t border-border-subtle px-4 py-2.5 text-[11px] text-fg-faint">
            Press <kbd className="rounded border border-border-default px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close. Looking for the full docs?{" "}
            <Link href="/docs" className="text-accent-blue hover:underline" onClick={close}>
              Open /docs
            </Link>
            .
          </footer>
        </div>
      ) : null}
    </>
  );
}
