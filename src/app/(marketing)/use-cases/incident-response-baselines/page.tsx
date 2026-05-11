import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, defaultOgImages } from "@/lib/seo";

const PATH = "/use-cases/incident-response-baselines";

export const metadata: Metadata = {
  title: "Incident Response: Baseline-Driven Triage for Linux · Blackglass",
  description:
    "When a Linux host might be compromised, the first question is 'what's different?' Blackglass answers it in seconds with a per-line diff against the last approved baseline — no live forensic image required, no waiting for an EDR to triangulate.",
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: "Incident Response: Baseline-Driven Triage for Linux · Blackglass",
    description:
      "Cut Linux IR triage from hours to minutes. Blackglass shows what changed since the last approved baseline — sshd, sudoers, persistence, packages, SUIDs — in seconds.",
    type: "website",
    siteName: "Blackglass",
    url: canonical(PATH),
    images: defaultOgImages(),
  },
};

export default function IncidentResponseBaselinesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Use cases", url: "/use-cases" },
          { name: "Incident response baselines", url: PATH },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Use case</p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        First question in any Linux incident: what changed?
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        When an alert fires on a Linux server — credential abuse, unexpected outbound traffic,
        suspicious process — the on-call engineer&rsquo;s first useful question is almost always
        the same: <em>what&rsquo;s different about this host since the last time we trusted it?</em>{" "}
        Blackglass answers that in seconds.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Why baselines beat ad-hoc forensics for the first 30 minutes
      </h2>
      <p className="mt-3 leading-relaxed">
        Without a baseline, the first half hour of Linux IR is reconstructive: tail every log, pull
        bash history, run rkhunter, compare process lists against memory&hellip; and you still
        don&rsquo;t know whether the SUID binary in <code className="font-mono text-accent-blue">
          /usr/local/bin
        </code>{" "}
        was always there or appeared at 03:47.
      </p>
      <p className="mt-4 leading-relaxed">
        With a Blackglass baseline, the answer is one click: every drift event since approval, in
        order, with severity, before/after diff, and the timestamp the change appeared. The
        on-call goes from &ldquo;is this host compromised?&rdquo; to &ldquo;here are the four
        things that changed since Tuesday, two were ours, two weren&rsquo;t&rdquo; in under a
        minute.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What the IR-specific drift view shows
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">New SSH authorized_keys</strong> — per user, per
          fingerprint, with the timestamp the key first appeared.
        </li>
        <li>
          <strong className="text-fg-primary">New sudoers entries</strong> — every file in{" "}
          <code className="font-mono text-accent-blue">/etc/sudoers.d/</code> that wasn&rsquo;t in
          the baseline, including NOPASSWD grants.
        </li>
        <li>
          <strong className="text-fg-primary">New SUID/SGID binaries anywhere on the
          filesystem</strong> — full enumeration vs baseline. New SUIDs are a rare and
          high-confidence signal.
        </li>
        <li>
          <strong className="text-fg-primary">New listeners</strong> — any TCP/UDP socket binding
          that wasn&rsquo;t in the baseline, with the binding process.
        </li>
        <li>
          <strong className="text-fg-primary">New systemd units &amp; cron entries</strong> —
          persistence mechanisms that appeared since approval.
        </li>
        <li>
          <strong className="text-fg-primary">Loaded kernel modules</strong> — new modules vs
          baseline, with module path and signature status.
        </li>
        <li>
          <strong className="text-fg-primary">Package install / removal</strong> — anything that
          appeared from <code className="font-mono text-accent-blue">apt</code>,{" "}
          <code className="font-mono text-accent-blue">dpkg</code>, or{" "}
          <code className="font-mono text-accent-blue">rpm</code> since the baseline, with install
          timestamp.
        </li>
        <li>
          <strong className="text-fg-primary">Hosts file &amp; resolver tampering</strong> — common
          persistence-and-redirection trick that&rsquo;s easy to miss without a hash diff.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        IR runbook — how teams actually use this
      </h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Page fires.</strong> Suspicious behaviour on{" "}
          <code className="font-mono text-accent-blue">prod-app-07</code>.
        </li>
        <li>
          <strong className="text-fg-primary">Open the host in Blackglass.</strong> Drift tab shows
          every change since the last approved baseline, ordered newest-first.
        </li>
        <li>
          <strong className="text-fg-primary">Triage by severity.</strong> HIGH events first — new
          SUIDs, sudoers grants, new authorized_keys, sshd config flips. These are the high-signal
          ones that distinguish a compromise from a deployment.
        </li>
        <li>
          <strong className="text-fg-primary">Cross-reference with deployment log.</strong> For each
          HIGH event: is there a corresponding approved change ticket? If yes → tag and move on. If
          no → keep digging.
        </li>
        <li>
          <strong className="text-fg-primary">Decide.</strong> If the unexplained drift looks
          malicious, isolate the host (firewall rule, security group change, depending on your
          environment) and start formal IR. If it looks benign, acknowledge each event with the
          rationale so the next on-call doesn&rsquo;t re-walk the same path.
        </li>
        <li>
          <strong className="text-fg-primary">Capture the new baseline (optionally).</strong> Once
          the host is back to a known-good state, capture a new approved baseline so you don&rsquo;t
          re-alert on yesterday&rsquo;s changes.
        </li>
      </ol>

      <div className="mt-12 rounded-lg border border-border-default bg-bg-panel p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
          What this looks like in practice
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          A real customer scenario from a recent walkthrough: alerts fire on a host running a third-
          party billing daemon. Blackglass drift view shows two things in the last 36 hours: a
          package upgrade matching the engineering team&rsquo;s scheduled patch window
          (acknowledged), and a new entry in <code className="font-mono text-accent-blue">
            /root/.ssh/authorized_keys
          </code>{" "}
          that doesn&rsquo;t match any team member&rsquo;s key inventory (escalated). Total time
          from page to escalation: 4 minutes.
        </p>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Pairing with your existing IR tooling
      </h2>
      <p className="mt-3 leading-relaxed">
        Blackglass doesn&rsquo;t replace your EDR, your SIEM, or your forensic imaging tools — it
        sits at the front of the funnel. The drift view is what you look at <em>before</em> deciding
        whether to spend the next two hours pulling a memory image and running deep forensics. For
        the majority of IR pages on a Linux host, baseline diff alone is enough to decide
        &ldquo;benign&rdquo; or &ldquo;escalate&rdquo;.
      </p>
      <p className="mt-4 leading-relaxed">
        Drift events can be forwarded to your SIEM via webhook (CEF / JSON envelope) so the IR
        timeline already has them when an analyst opens the case.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related use cases</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link
            href="/use-cases/linux-configuration-drift-detection"
            className="text-accent-blue hover:underline"
          >
            Linux configuration drift detection
          </Link>{" "}
          — the underlying continuous-detection story.
        </li>
        <li>
          <Link
            href="/use-cases/file-integrity-monitoring"
            className="text-accent-blue hover:underline"
          >
            File integrity monitoring (FIM)
          </Link>{" "}
          — hash-based detection of file tampering.
        </li>
        <li>
          <Link
            href="/use-cases/ssh-configuration-audit"
            className="text-accent-blue hover:underline"
          >
            SSH configuration audit
          </Link>{" "}
          — deep-dive on the SSH attack surface.
        </li>
      </ul>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/demo"
          className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
        >
          See a sample IR view
        </Link>
        <Link
          href="/sign-up"
          className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
        >
          Capture your first baseline
        </Link>
      </div>
      <p className="mt-4 text-xs text-fg-faint">
        14-day trial · up to 10 hosts · no card required
      </p>
    </main>
  );
}
