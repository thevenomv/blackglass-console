import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, defaultOgImages } from "@/lib/seo";

const PATH = "/use-cases/file-integrity-monitoring";

export const metadata: Metadata = {
  title: "File Integrity Monitoring (FIM) for Linux · Blackglass",
  description:
    "Practical file integrity monitoring across Linux fleets. Blackglass watches the files PCI-DSS, SOC 2, and ISO 27001 actually care about — config files, binaries, sudoers, SSH keys — without flooding your dashboard with noise from log rotations or temp files.",
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: "File Integrity Monitoring (FIM) for Linux · Blackglass",
    description:
      "Practical FIM for Linux. Hash-based change detection on the files compliance frameworks actually care about. No agent compute drain, no alert noise from /var/log churn.",
    type: "website",
    siteName: "Blackglass",
    url: canonical(PATH),
    images: defaultOgImages(),
  },
};

export default function FileIntegrityMonitoringPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Use cases", url: "/use-cases" },
          { name: "File integrity monitoring", url: PATH },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Use case</p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        File integrity monitoring that doesn&rsquo;t scream at you
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        Most FIM tools either watch <em>everything</em> (and bury you in alerts every time logrotate
        fires) or watch nothing useful (a fixed list from 2014 that hasn&rsquo;t kept up with how
        Linux actually ships). Blackglass watches the files compliance frameworks actually care
        about, and the ones attackers actually touch.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What &ldquo;file integrity&rdquo; should mean in 2026
      </h2>
      <p className="mt-3 leading-relaxed">
        PCI-DSS 11.5, SOC 2 CC7.1, ISO 27001 A.12.4, and SOX ITGC 1.4 all require &ldquo;file
        integrity monitoring&rdquo; — but none of them define what that actually means in
        operational terms. The honest answer is: detect unauthorised changes to the files that, if
        modified, would either (a) change the security posture of the host, (b) enable
        persistence, or (c) tamper with evidence. Everything else is theatre.
      </p>
      <p className="mt-4 leading-relaxed">
        Blackglass treats FIM as a subset of a broader configuration-integrity story. Same scan,
        same baseline, same drift events — file hashes are just one signal among several
        deterministic checks.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What Blackglass actually monitors
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">SSH daemon &amp; client config</strong> —{" "}
          <code className="font-mono text-accent-blue">/etc/ssh/sshd_config</code>,{" "}
          <code className="font-mono text-accent-blue">/etc/ssh/ssh_config</code>, and any{" "}
          <code className="font-mono text-accent-blue">Include</code>-merged fragments.
        </li>
        <li>
          <strong className="text-fg-primary">Identity &amp; sudo</strong> —{" "}
          <code className="font-mono text-accent-blue">/etc/passwd</code>,{" "}
          <code className="font-mono text-accent-blue">/etc/shadow</code> (hash only, not contents),{" "}
          <code className="font-mono text-accent-blue">/etc/group</code>,{" "}
          <code className="font-mono text-accent-blue">/etc/sudoers</code>, and every file in{" "}
          <code className="font-mono text-accent-blue">/etc/sudoers.d/</code>.
        </li>
        <li>
          <strong className="text-fg-primary">Persistence</strong> —{" "}
          <code className="font-mono text-accent-blue">authorized_keys</code> per user, systemd unit
          files, cron entries (system + per-user crontabs), and PAM stack files.
        </li>
        <li>
          <strong className="text-fg-primary">Boot &amp; kernel</strong> — GRUB config, kernel
          command line, sysctl entries, loaded kernel modules.
        </li>
        <li>
          <strong className="text-fg-primary">Hosts file &amp; resolver</strong> —{" "}
          <code className="font-mono text-accent-blue">/etc/hosts</code>,{" "}
          <code className="font-mono text-accent-blue">/etc/resolv.conf</code>,{" "}
          <code className="font-mono text-accent-blue">/etc/nsswitch.conf</code>.
        </li>
        <li>
          <strong className="text-fg-primary">SUID/SGID binary set</strong> — full enumeration with
          per-binary hash, so a new SUID anywhere on the filesystem is a HIGH-severity event.
        </li>
        <li>
          <strong className="text-fg-primary">Web server &amp; reverse proxy config</strong> — nginx,
          apache, caddy, haproxy main + included fragments.
        </li>
        <li>
          <strong className="text-fg-primary">Custom paths you add</strong> — point Blackglass at any
          additional file or directory on the host (per-baseline, per-host, or fleet-wide policy).
        </li>
      </ul>
      <p className="mt-4 leading-relaxed">
        And, deliberately, what we <em>don&rsquo;t</em> watch by default: log files,{" "}
        <code className="font-mono text-accent-blue">/var/lib/*</code>, package caches, temp
        directories, runtime state. These churn constantly and are nobody&rsquo;s real FIM target.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">How it works</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Capture an approved baseline.</strong> First scan
          records the hash of every monitored file plus the metadata that matters (owner, mode,
          SUID, mtime). You confirm it&rsquo;s the state you intend to defend.
        </li>
        <li>
          <strong className="text-fg-primary">Run scheduled or push scans.</strong> Re-hash on the
          cadence you choose (hourly default for FIM-sensitive paths). The push agent surfaces
          changes within ~60 seconds for paths that matter.
        </li>
        <li>
          <strong className="text-fg-primary">Severity from the field, not from ML.</strong> Drift
          on <code className="font-mono text-accent-blue">/etc/passwd</code> is HIGH. Drift on a
          custom monitored path inherits whatever severity you pinned to it. Predictable.
        </li>
        <li>
          <strong className="text-fg-primary">Acknowledge, assign, close.</strong> Each event has an
          owner, a due date, a note. The history exports to PDF + JSON for the auditor.
        </li>
      </ol>

      <div className="mt-12 rounded-lg border border-border-default bg-bg-panel p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
          Sample FIM event
        </p>
        <div className="mt-4 space-y-3 font-mono text-sm">
          <div className="flex items-start gap-3">
            <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400">
              HIGH
            </span>
            <div>
              <p className="text-fg-primary">/etc/sudoers.d/90-deploy</p>
              <p className="mt-0.5 text-xs text-fg-faint">
                hash: <span className="text-emerald-400">absent</span>
                {" → "}
                <span className="text-red-400">e3f1a8&hellip;</span>
              </p>
              <p className="mt-0.5 text-xs text-fg-faint">
                appeared 03:47 UTC · owner deploy · mode 0440
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400">
              HIGH
            </span>
            <div>
              <p className="text-fg-primary">/usr/local/bin/.svchost</p>
              <p className="mt-0.5 text-xs text-fg-faint">
                new SUID binary · owner root · mode 4755 · hash{" "}
                <span className="text-red-400">9a02bf&hellip;</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Mapping to common compliance frameworks
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">PCI-DSS 11.5.2</strong> — change-detection mechanism
          deployed; weekly comparison of critical files. Blackglass exceeds this with hourly default
          and per-event timestamps.
        </li>
        <li>
          <strong className="text-fg-primary">SOC 2 CC7.1</strong> — system operations include
          monitoring of system components for changes. Drift events with operator approval workflow
          satisfy auditor expectations.
        </li>
        <li>
          <strong className="text-fg-primary">ISO 27001 A.12.4 / A.12.6</strong> — logging and
          vulnerability management. Drift exports double as the &ldquo;evidence of change-control
          adherence&rdquo; auditors ask for.
        </li>
        <li>
          <strong className="text-fg-primary">SOX ITGC 1.4</strong> — change management evidence.
          Per-host evidence bundle ties baseline approval timestamp to subsequent drift events.
        </li>
        <li>
          <strong className="text-fg-primary">HIPAA &sect; 164.312(c)(1)</strong> — integrity
          controls for ePHI systems. File-hash drift on configs that govern access (sshd, sudoers,
          PAM) directly applies.
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
          — the broader story FIM fits inside.
        </li>
        <li>
          <Link href="/use-cases/sox-evidence-capture" className="text-accent-blue hover:underline">
            SOX change-control evidence capture
          </Link>{" "}
          — tying drift events to formal change records.
        </li>
        <li>
          <Link
            href="/use-cases/cis-benchmark-monitoring"
            className="text-accent-blue hover:underline"
          >
            CIS benchmark monitoring
          </Link>{" "}
          — keeping hardening intact alongside FIM.
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
          href="/sign-up"
          className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
        >
          Start free trial
        </Link>
        <Link
          href="/product"
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          Full product tour →
        </Link>
      </div>
      <p className="mt-4 text-xs text-fg-faint">
        14-day trial · up to 10 hosts · no card required
      </p>
    </main>
  );
}
