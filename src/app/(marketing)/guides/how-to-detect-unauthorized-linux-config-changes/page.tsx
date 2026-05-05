import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Detect Unauthorized Linux Config Changes | BLACKGLASS",
  description:
    "A practical guide to detecting unauthorized configuration changes on Linux servers — covering manual techniques, tooling options, and how to build a sustainable drift detection workflow.",
  openGraph: {
    title: "How to Detect Unauthorized Linux Config Changes | BLACKGLASS",
    description:
      "A practical guide to detecting unauthorized configuration changes on Linux servers — covering manual techniques, tooling options, and how to build a sustainable drift detection workflow.",
    type: "article",
    siteName: "BLACKGLASS",
  },
};

export default function DetectUnauthorizedChangesGuidePage() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Guide
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          How to detect unauthorized Linux configuration changes
        </h1>
        <p className="mt-4 text-sm text-fg-faint">
          ~12 min read · SSH hardening, drift detection, Linux security
        </p>

        <p className="mt-6 text-lg leading-relaxed">
          Unauthorized or untracked configuration changes are one of the most common causes of
          security regressions and availability incidents on Linux infrastructure. This guide covers
          the problem, manual detection techniques, and how to build a scalable monitoring workflow.
        </p>

        {/* TOC */}
        <nav aria-label="Table of contents" className="mt-8 rounded-lg border border-border-default bg-bg-panel p-4 text-sm">
          <p className="font-semibold text-fg-primary">Contents</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-fg-muted">
            <li><a href="#what-counts" className="hover:text-accent-blue hover:underline">What counts as an unauthorized config change?</a></li>
            <li><a href="#why-hard" className="hover:text-accent-blue hover:underline">Why it&apos;s hard to detect manually</a></li>
            <li><a href="#manual-techniques" className="hover:text-accent-blue hover:underline">Manual detection techniques</a></li>
            <li><a href="#tooling" className="hover:text-accent-blue hover:underline">Tools for config change detection</a></li>
            <li><a href="#sustainable-workflow" className="hover:text-accent-blue hover:underline">Building a sustainable workflow</a></li>
            <li><a href="#blackglass-approach" className="hover:text-accent-blue hover:underline">How Blackglass approaches this problem</a></li>
          </ol>
        </nav>

        {/* Section 1 */}
        <h2 id="what-counts" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          1. What counts as an unauthorized config change?
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          An {'"'}unauthorized{'"'} change is any modification to system configuration that was not part of
          an approved change process. This includes:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>Direct edits to <code className="font-mono text-accent-blue">/etc/ssh/sshd_config</code> (or its Include fragments) outside of a configuration management run.</li>
          <li>Changes to kernel parameters via <code className="font-mono text-accent-blue">sysctl</code> that are not persisted to <code className="font-mono text-accent-blue">/etc/sysctl.d/</code>.</li>
          <li>New network listeners appearing on ports that were not in the approved service list.</li>
          <li>Package upgrades that revert a hardened configuration file to the package default.</li>
          <li>New user accounts or privilege escalation paths (sudoers changes, new SSH authorized_keys entries).</li>
        </ul>
        <p className="mt-4 leading-relaxed text-sm">
          The word {'"'}unauthorized{'"'} matters more in regulated environments. In smaller teams, the concern
          is often simpler: <em>a change happened that nobody documented, and now nobody knows if it is
          intentional or a mistake</em>.
        </p>

        {/* Section 2 */}
        <h2 id="why-hard" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          2. Why it&apos;s hard to detect manually
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">No single canonical config source.</strong> Configuration
            is spread across dozens of files. <code className="font-mono text-accent-blue">sshd_config</code>{" "}
            can include files from <code className="font-mono text-accent-blue">/etc/ssh/sshd_config.d/</code>.
            Many tools only check the main file.
          </li>
          <li>
            <strong className="text-fg-primary">Volume.</strong> A 50-host fleet means 50 separate files
            to compare. At 200 hosts it becomes impossible to review manually on any meaningful schedule.
          </li>
          <li>
            <strong className="text-fg-primary">No baseline to compare against.</strong> {'"'}The config
            changed{'"'} is only meaningful if you know what it changed <em>from</em>. Without a recorded
            baseline, you can only describe the current state.
          </li>
          <li>
            <strong className="text-fg-primary">Transient changes.</strong> A <code className="font-mono text-accent-blue">sysctl</code>{" "}
            value changed at runtime (not persisted to disk) will not appear in a file-based audit.
          </li>
        </ul>

        {/* Section 3 */}
        <h2 id="manual-techniques" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          3. Manual detection techniques
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          These approaches work for small fleets or one-off investigations.
        </p>

        <h3 className="mt-8 text-base font-semibold text-fg-primary">
          Comparing sshd_config against a known baseline
        </h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border-default bg-bg-panel p-4 font-mono text-xs leading-relaxed text-fg-primary">
{`# On the host — dump effective SSH config (includes all Include fragments)
sshd -T 2>/dev/null | sort > /tmp/sshd_effective_now.txt

# Compare against a previously saved baseline
diff /var/lib/baseline/sshd_effective_baseline.txt /tmp/sshd_effective_now.txt`}
        </pre>
        <p className="mt-3 leading-relaxed text-sm">
          <code className="font-mono text-accent-blue">sshd -T</code> is key here — it dumps the
          <em>effective</em> configuration after processing all Include directives, not just the main
          file. Most ad-hoc audits miss this.
        </p>

        <h3 className="mt-8 text-base font-semibold text-fg-primary">
          Checking sysctl values
        </h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border-default bg-bg-panel p-4 font-mono text-xs leading-relaxed text-fg-primary">
{`# Dump all current kernel parameters
sysctl -a 2>/dev/null | sort > /tmp/sysctl_now.txt

# Compare against baseline
diff /var/lib/baseline/sysctl_baseline.txt /tmp/sysctl_now.txt`}
        </pre>

        <h3 className="mt-8 text-base font-semibold text-fg-primary">
          Checking open listeners
        </h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border-default bg-bg-panel p-4 font-mono text-xs leading-relaxed text-fg-primary">
{`# List all listening TCP/UDP services
ss -tlnpu 2>/dev/null

# Or: on older systems
netstat -tlnpu 2>/dev/null`}
        </pre>

        <h3 className="mt-8 text-base font-semibold text-fg-primary">
          Checking system logs for SSH config reloads
        </h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border-default bg-bg-panel p-4 font-mono text-xs leading-relaxed text-fg-primary">
{`# Look for sshd reload events in the last 7 days
journalctl -u ssh.service --since "7 days ago" | grep -E "reload|reopen|restart|SIGHUP"`}
        </pre>

        {/* Section 4 */}
        <h2 id="tooling" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          4. Tools for config change detection
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          Several categories of tool are relevant here, with different trade-offs:
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border border-border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-panel">
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">Tool type</th>
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">Examples</th>
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">Trade-offs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-sm">
              <tr className="bg-bg-base">
                <td className="px-4 py-3 font-semibold text-fg-primary">FIM (File Integrity Monitoring)</td>
                <td className="px-4 py-3 text-fg-muted">AIDE, Tripwire, auditd</td>
                <td className="px-4 py-3 text-fg-muted">Detects file changes but produces high noise; requires careful tuning</td>
              </tr>
              <tr className="bg-bg-base">
                <td className="px-4 py-3 font-semibold text-fg-primary">Config management</td>
                <td className="px-4 py-3 text-fg-muted">Ansible, Puppet, Chef</td>
                <td className="px-4 py-3 text-fg-muted">Enforces desired state on managed hosts; drift between runs is invisible</td>
              </tr>
              <tr className="bg-bg-base">
                <td className="px-4 py-3 font-semibold text-fg-primary">Benchmark scanners</td>
                <td className="px-4 py-3 text-fg-muted">CIS-CAT, OpenSCAP, Lynis</td>
                <td className="px-4 py-3 text-fg-muted">Point-in-time pass/fail; no change tracking over time</td>
              </tr>
              <tr className="bg-bg-base">
                <td className="px-4 py-3 font-semibold text-fg-primary">CSPM / cloud posture</td>
                <td className="px-4 py-3 text-fg-muted">Wiz, Orca, Prisma</td>
                <td className="px-4 py-3 text-fg-muted">Cloud-focused; limited Linux OS config visibility without agents</td>
              </tr>
              <tr className="bg-bg-base">
                <td className="px-4 py-3 font-semibold text-fg-primary">Dedicated drift tools</td>
                <td className="px-4 py-3 text-fg-muted">Blackglass</td>
                <td className="px-4 py-3 text-fg-muted">Baseline-vs-current comparison, severity classification, evidence workflow</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 5 */}
        <h2 id="sustainable-workflow" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          5. Building a sustainable workflow
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          Manual techniques stop scaling past a handful of hosts. A sustainable workflow needs:
        </p>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">A recorded baseline for each host.</strong> Not just
            {'"'}what is the desired state{'"'} in version control, but {'"'}what is the actual current state on
            this host at this point in time.{'"'} These diverge more often than teams expect.
          </li>
          <li>
            <strong className="text-fg-primary">Automated, scheduled collection.</strong> Changes happen
            at any time. Daily or hourly scans reduce the window between a change and detection.
          </li>
          <li>
            <strong className="text-fg-primary">Severity filtering.</strong> Not every config difference
            is worth waking someone up for. A workflow that does not filter by risk will be ignored
            quickly.
          </li>
          <li>
            <strong className="text-fg-primary">Remediation tracking.</strong> Detection without a clear
            handoff to fix-and-document is only half the loop. The workflow must include ownership,
            due dates, and a way to close the loop with evidence.
          </li>
          <li>
            <strong className="text-fg-primary">Evidence export.</strong> The end goal is often not
            just {'"'}is this fixed?{'"'} but {'"'}can I prove to an auditor that we detected it, responded, and
            documented it?{'"'} — structured export is essential.
          </li>
        </ol>

        {/* Section 6 */}
        <h2 id="blackglass-approach" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
          6. How Blackglass approaches this problem
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          Blackglass is designed specifically around the drift detection and evidence workflow
          described above. Rather than trying to do everything, it focuses on:
        </p>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Agentless SSH collection</strong> — Blackglass
            connects to hosts over SSH to collect configuration metadata (effective SSH directives,
            sysctl values, open listeners, service states). No persistent agent to maintain.
          </li>
          <li>
            <strong className="text-fg-primary">Baseline pinning</strong> — after a hardening pass or
            approved change, you capture the state as the new baseline. Future scans compare against
            that baseline, not an abstract ideal.
          </li>
          <li>
            <strong className="text-fg-primary">Severity-classified drift events</strong> — changes
            surface with HIGH / MEDIUM / INFO severity based on the field and value affected. You see
            the before and after values inline.
          </li>
          <li>
            <strong className="text-fg-primary">Remediation workflow</strong> — each event can be
            assigned, acknowledged, and closed with an operator note. The full lifecycle is recorded.
          </li>
          <li>
            <strong className="text-fg-primary">Evidence bundles</strong> — export a dated, structured
            bundle (baseline, drift history, remediation records) for audit submissions.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-sm">
          Blackglass does not copy file contents, application secrets, or private keys into its
          storage — only the metadata needed to detect meaningful drift.
        </p>

        {/* Related */}
        <div className="mt-14 rounded-lg border border-border-default bg-bg-panel p-5">
          <p className="font-semibold text-fg-primary">Related use cases and guides</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/use-cases/linux-configuration-drift-detection" className="text-accent-blue hover:underline">
                Linux configuration drift detection
              </Link>
            </li>
            <li>
              <Link href="/use-cases/ssh-configuration-audit" className="text-accent-blue hover:underline">
                SSH configuration audit
              </Link>
            </li>
            <li>
              <Link href="/use-cases/linux-hardening-monitoring" className="text-accent-blue hover:underline">
                Linux hardening monitoring
              </Link>
            </li>
            <li>
              <Link href="/use-cases/cis-benchmark-monitoring" className="text-accent-blue hover:underline">
                CIS benchmark monitoring
              </Link>
            </li>
            <li>
              <Link href="/product" className="text-accent-blue hover:underline">
                Full product overview →
              </Link>
            </li>
          </ul>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap gap-3">
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
        </div>
        <p className="mt-4 text-xs text-fg-faint">14-day trial · up to 10 hosts · no card required</p>
    </main>
  );
}
