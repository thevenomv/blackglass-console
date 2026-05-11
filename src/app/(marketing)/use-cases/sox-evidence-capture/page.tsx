import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, defaultOgImages } from "@/lib/seo";

const PATH = "/use-cases/sox-evidence-capture";

export const metadata: Metadata = {
  title: "SOX & SOC 2 Change-Control Evidence for Linux · Blackglass",
  description:
    "Auditor-grade evidence of every Linux server configuration change, tied to operator approval. Replaces manual screenshot collection and 'trust me' Slack threads with per-host PDF + JSON exports auditors can open without further interpretation.",
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: "SOX & SOC 2 Change-Control Evidence for Linux · Blackglass",
    description:
      "Auditor-grade evidence of every Linux config change, with operator approval workflow. PDF + JSON evidence bundles per host. Designed for SOX ITGC 1.4 and SOC 2 CC8.1 walkthroughs.",
    type: "website",
    siteName: "Blackglass",
    url: canonical(PATH),
    images: defaultOgImages(),
  },
};

export default function SoxEvidenceCapturePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Use cases", url: "/use-cases" },
          { name: "SOX change-control evidence", url: PATH },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Use case</p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        Stop reinventing change-control evidence every audit cycle
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        Most teams under SOX or SOC 2 build their Linux change-control evidence manually: a wiki
        page of Jira tickets, screenshots of approved PRs, exported Slack threads, and a prayer
        that the auditor doesn&rsquo;t ask &ldquo;and how do you know <em>nothing else</em> changed
        on those servers between approvals?&rdquo; Blackglass closes that gap.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What auditors actually want
      </h2>
      <p className="mt-3 leading-relaxed">
        Whether the framework is SOX ITGC 1.4, SOC 2 CC8.1, ISO 27001 A.12.1.2, or a sector-specific
        equivalent, the underlying question is the same: <em>can you prove that every change to a
        production system was approved, and that no unapproved changes happened?</em> The evidence
        package needs to:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        <li>Identify a known-good baseline state with operator approval and timestamp.</li>
        <li>Show every deviation from that baseline since approval.</li>
        <li>For each deviation: who acknowledged it, when, with what context.</li>
        <li>Be reproducible — auditors return next year and ask for the same view.</li>
      </ol>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        How Blackglass produces audit-ready evidence
      </h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Baseline approval.</strong> An operator with the
          appropriate role captures a baseline of the host (or fleet group) and explicitly
          approves it. The approval is signed, timestamped, and audit-logged.
        </li>
        <li>
          <strong className="text-fg-primary">Every drift becomes a record.</strong> Subsequent
          scans (push or pull) detect changes against the approved baseline. Each drift event has
          a stable ID, severity, before/after diff, and a status field.
        </li>
        <li>
          <strong className="text-fg-primary">Acknowledgement is the change-control bridge.</strong>{" "}
          When a drift event is acknowledged, the operator records the rationale (free text + tag),
          links the relevant change ticket (Jira / Linear / GitHub PR URL), and the audit log
          captures the actor + timestamp.
        </li>
        <li>
          <strong className="text-fg-primary">Evidence bundle export.</strong> One click produces a
          per-host PDF summary plus a JSON archive containing baseline content, every drift event,
          acknowledgement metadata, and the audit log slice for the period. The PDF is readable by
          a non-technical auditor; the JSON is machine-parseable for evidence platforms.
        </li>
      </ol>

      <div className="mt-12 rounded-lg border border-border-default bg-bg-panel p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
          Sample evidence bundle contents
        </p>
        <ul className="mt-3 space-y-1.5 font-mono text-sm">
          <li className="text-fg-primary">evidence-host-prod-app-01-2026Q1.pdf</li>
          <li className="text-fg-muted">↳ executive summary, baseline metadata, drift table, acknowledgement log</li>
          <li className="text-fg-primary">evidence-host-prod-app-01-2026Q1.json</li>
          <li className="text-fg-muted">↳ full machine-readable archive (baseline + drift + audit log)</li>
          <li className="text-fg-primary">evidence-host-prod-app-01-2026Q1.sig</li>
          <li className="text-fg-muted">↳ detached signature over the JSON for tamper detection</li>
        </ul>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Where this lands in your audit narrative
      </h2>
      <p className="mt-3 leading-relaxed">
        For a SOX walkthrough, the auditor traditionally pulls a sample of changes from your Jira
        export and asks you to demonstrate, for each, that the change was approved before being
        applied. The Blackglass evidence bundle inverts that: it shows every change that occurred
        on the host, with the corresponding approval (acknowledgement) attached. Sample-of-one
        becomes population-of-everything, with much less work.
      </p>
      <p className="mt-4 leading-relaxed">
        For SOC 2, the relevant control is typically CC8.1 (&ldquo;the entity authorises, designs,
        develops or acquires, configures, documents, tests, approves, and implements changes&rdquo;).
        Auditors look for evidence that <em>configuration</em> changes — not just code changes —
        follow the same approval discipline. Blackglass directly answers that question.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What the workflow actually feels like
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          Engineer ships an approved change → Blackglass detects the resulting drift → operator
          opens the drift event → links the Jira / GitHub URL → adds a one-line note → marks the
          event acknowledged.
        </li>
        <li>
          Engineer makes an out-of-band hotfix during an incident → drift surfaces → on-call
          acknowledges it with the incident ticket as the bridge → post-incident review reassesses
          whether the change should be retroactively approved or rolled back.
        </li>
        <li>
          Quarterly audit review → operator opens the host → exports the evidence bundle for the
          audit period → hands it to the auditor. Total time per host: under a minute.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related use cases</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link
            href="/use-cases/linux-configuration-drift-detection"
            className="text-accent-blue hover:underline"
          >
            Linux configuration drift detection
          </Link>{" "}
          — the underlying detection model.
        </li>
        <li>
          <Link
            href="/use-cases/file-integrity-monitoring"
            className="text-accent-blue hover:underline"
          >
            File integrity monitoring (FIM)
          </Link>{" "}
          — overlapping coverage that satisfies PCI-DSS 11.5.
        </li>
        <li>
          <Link
            href="/use-cases/cis-benchmark-monitoring"
            className="text-accent-blue hover:underline"
          >
            CIS benchmark monitoring
          </Link>{" "}
          — pin a CIS profile as your baseline.
        </li>
      </ul>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/demo"
          className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
        >
          Explore demo
        </Link>
        <Link
          href="/contact-sales"
          className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
        >
          Talk to a SOX-experienced engineer
        </Link>
      </div>
      <p className="mt-4 text-xs text-fg-faint">
        Need a sample evidence bundle for your auditor? Email jamie@obsidiandynamics.co.uk and
        we&rsquo;ll send a redacted one.
      </p>
    </main>
  );
}
