import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "linux-change-record-soc2-audit";
const POST = getBlogPost(SLUG)!;
const PATH = `/blog/${SLUG}`;
const POST_URL = canonical(PATH) ?? PATH;

export const metadata: Metadata = {
  title: `${POST.title} · Blackglass`,
  description: POST.excerpt,
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: POST.title,
    description: POST.excerpt,
    type: "article",
    siteName: "Blackglass",
    url: canonical(PATH),
    publishedTime: POST.date,
    authors: [POST.author.name],
    tags: [...POST.tags],
    images: dynamicOgImages({
      title: POST.title,
      subtitle: `${POST.readingTime} · ${POST.author.name}`,
    }),
  },
};

export default function Post() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: POST.title, url: PATH },
        ])}
      />
      <JsonLd
        id="schema-article"
        data={articleSchema({
          url: POST_URL,
          headline: POST.title,
          description: POST.excerpt,
          datePublished: POST.date,
          author: POST.author,
          tags: POST.tags,
        })}
      />

      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Security</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        SOC 2 auditors increasingly ask a deceptively simple question: <em>what changed on your
        Linux servers last quarter?</em> For most teams — even well-run ones — the honest answer
        is &ldquo;we&rsquo;d have to reconstruct that from a few places.&rdquo; Here&rsquo;s why
        that gap exists, what auditors actually need, and the practical way to close it without a
        SIEM project.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What SOC 2 actually requires for change management
      </h2>
      <p className="mt-3 leading-relaxed">
        SOC 2 Type II sits under the Trust Services Criteria (TSC). The relevant criterion for
        this problem is <strong className="text-fg-primary">CC6.8</strong>:{" "}
        <em>the entity implements controls to prevent or detect and act upon the introduction of
        unauthorized or malicious software.</em> CC8.1 goes further: authorised changes must be
        tracked with sufficient detail to demonstrate that changes were planned, tested, and
        approved before they were applied.
      </p>
      <p className="mt-4 leading-relaxed">
        In practice, auditors want to see a credible answer to{" "}
        <em>how do you know what changed, and how do you know it was intentional?</em> For
        application deployments, most teams have a CI/CD pipeline and a deployment log that
        satisfies this easily. For Linux host configuration — the OS layer, sshd settings,
        open ports, cron jobs, installed packages, kernel modules — the record is usually far
        thinner.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Why Linux is where the change record breaks down
      </h2>
      <p className="mt-3 leading-relaxed">
        Three patterns conspire to create gaps:
      </p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Ad-hoc hotfixes.</strong> An engineer logs in during
          an incident, adjusts a sysctl or PAM setting to stop the bleeding, and the change never
          makes it back into Ansible. The host now diverges from every other host in its class.
          Nobody wrote it down.
        </li>
        <li>
          <strong className="text-fg-primary">Package manager side-effects.</strong> A routine
          <code className="font-mono text-accent-blue"> apt upgrade</code> updates OpenSSH and
          silently rewrites <code className="font-mono text-accent-blue">/etc/ssh/sshd_config</code>.
          The change was &ldquo;automated&rdquo;, but it wasn&rsquo;t logged in a way an auditor
          can read.
        </li>
        <li>
          <strong className="text-fg-primary">IaC drift.</strong> Terraform or Ansible describes
          intent; it doesn&rsquo;t record what your hosts actually look like today. The
          apply was six months ago. Many things have happened since.
        </li>
      </ul>
      <p className="mt-4 leading-relaxed">
        The result: when an auditor asks &ldquo;can you show me the change record for this host
        between January and March?&rdquo;, the answer involves stitching together SSH logs, git
        history, Ansible run records, and maybe CloudTrail — none of which map cleanly to
        individual host state at a point in time.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What a good Linux change record looks like for an auditor
      </h2>
      <p className="mt-3 leading-relaxed">
        A usable change record for SOC 2 purposes answers these questions for each finding:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>What specifically changed? (file, setting, package, account)</li>
        <li>When was it first detected?</li>
        <li>What was the previous state?</li>
        <li>Was it acknowledged? By whom?</li>
        <li>Was it remediated, or explicitly accepted as expected?</li>
      </ul>
      <p className="mt-4 leading-relaxed">
        Crucially, auditors are not asking for perfection — they&rsquo;re asking for evidence that
        you know what happened and that someone made a decision about it. A tool that surfaces
        drift, lets you triage it, and exports a signed timeline of that triage is worth more
        than a SIEM that captures everything but is unreadable without a specialist.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        The archaeology problem: why logs aren&rsquo;t enough
      </h2>
      <p className="mt-3 leading-relaxed">
        Some teams try to solve this with{" "}
        <code className="font-mono text-accent-blue">auditd</code>, syslog aggregation, or a
        SIEM. Those tools absolutely have their place — but they capture events, not state. If
        you want to know &ldquo;what was in{" "}
        <code className="font-mono text-accent-blue">/etc/sudoers</code> on host X between
        January and March?&rdquo;, an event log tells you when the file was touched; it
        doesn&rsquo;t tell you what the file said before and after.
      </p>
      <p className="mt-4 leading-relaxed">
        Baseline snapshots solve the state-over-time problem. Take a snapshot of every host at
        regular intervals, diff each snapshot against the approved baseline, and you have a
        timestamped record of what changed, when, and how it compared to policy — in a form an
        auditor can actually read without a query language.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        ISO 27001 and CIS benchmark context
      </h2>
      <p className="mt-3 leading-relaxed">
        The same gap applies under{" "}
        <strong className="text-fg-primary">ISO 27001 Annex A.12.1</strong> (operational
        procedures and responsibilities) and{" "}
        <strong className="text-fg-primary">A.12.6.1</strong> (management of technical
        vulnerabilities). CIS Controls v8{" "}
        <strong className="text-fg-primary">Control 4</strong> (secure configuration of enterprise
        assets) explicitly requires continuous monitoring of configuration drift — not just a
        point-in-time hardening pass.
      </p>
      <p className="mt-4 leading-relaxed">
        In all three frameworks, the question is the same: can you demonstrate that your system
        configuration is in a known-good state, and that deviations are detected and acted upon?
        A quarterly manual audit answers neither question.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What this looks like in Blackglass
      </h2>
      <p className="mt-3 leading-relaxed">
        Blackglass captures a structured baseline snapshot of each host — sshd configuration, open
        listeners, identity and sudo state, persistence mechanisms, installed packages, kernel
        modules, and monitored files. Every subsequent scan diffs the current state against that
        baseline and surfaces changes as severity-ranked findings.
      </p>
      <p className="mt-4 leading-relaxed">
        When an auditor asks for the change record, you open the evidence export, select a date
        range and a host or group, and download a JSON or PDF bundle that maps directly to the
        five-question framework above. It takes about 20 seconds. There is no query language.
        There is no SIEM.
      </p>
      <p className="mt-4 leading-relaxed">
        Each finding records what changed, when it was first seen, its severity in terms of
        CIS/STIG controls, and whether it was acknowledged or remediated. The audit log is
        immutable on paid plans. Reviewers can be added as read-only &ldquo;viewer&rdquo; seats
        at no extra cost — so your external auditor can log in and pull what they need directly,
        without you having to export and email files.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Practical setup path</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Install the push agent</strong> on each host (single
          binary, systemd unit, ~2 minutes per host). The agent sends a structured snapshot on its
          schedule; Blackglass never opens an inbound SSH connection.
        </li>
        <li>
          <strong className="text-fg-primary">Capture an approved baseline</strong> once your
          configuration is in a known-good state. All future snapshots diff against this.
        </li>
        <li>
          <strong className="text-fg-primary">Triage the first set of findings.</strong> Some
          will be legitimate (a package update you knew about); mark those as expected. Others may
          surface things you&rsquo;d forgotten about.
        </li>
        <li>
          <strong className="text-fg-primary">Export an evidence bundle</strong> at your next
          audit cycle. Select date range, select hosts, download. The bundle includes a signed
          manifest, per-finding detail, and a summary section aimed at non-technical reviewers.
        </li>
      </ol>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link
            className="text-accent-blue hover:underline"
            href="/use-cases/sox-evidence-capture"
          >
            Use case: SOX evidence capture with Blackglass
          </Link>
        </li>
        <li>
          <Link
            className="text-accent-blue hover:underline"
            href="/use-cases/linux-configuration-drift-detection"
          >
            Use case: Linux configuration drift detection
          </Link>
        </li>
        <li>
          <Link
            className="text-accent-blue hover:underline"
            href="/blog/snapshot-freshness-for-linux-evidence"
          >
            Snapshot freshness: why &lsquo;last seen&rsquo; timestamps matter for evidence
          </Link>
        </li>
        <li>
          <Link className="text-accent-blue hover:underline" href="/demo">
            Explore the demo workspace — no signup
          </Link>
        </li>
      </ul>
    </main>
  );
}
