import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security — BLACKGLASS by Obsidian Dynamics",
  description:
    "How BLACKGLASS protects your data: encryption, access control, credential handling, audit logging, and the security posture of the platform itself.",
  openGraph: {
    title: "Security — BLACKGLASS",
    description:
      "How BLACKGLASS protects your data: encryption, access control, credential handling, audit logging, and platform hardening.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

// ---------------------------------------------------------------------------
// Layout atoms
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-base font-semibold text-fg-primary">{children}</h2>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{children}</p>
  );
}

function DomainCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-panel px-5 py-4">
      <p className="text-sm font-semibold text-fg-primary">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-0.5 shrink-0 text-fg-faint">–</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const DRIFT_CATEGORIES = [
  ["Network", "New or removed listening ports, firewall rule changes"],
  ["Identity", "New users, removed users, group membership changes, sudo policy changes"],
  ["Persistence", "New systemd units or services, authorised SSH key changes, crontab changes"],
  ["Policy", "sshd configuration deviations (e.g. PasswordAuthentication, X11Forwarding)"],
  ["Supply chain", "Installed or removed packages, version changes"],
  ["Integrity", "File hash deviations on critical system files"],
  ["Privilege escalation", "New SUID/SGID binaries, new kernel modules"],
  ["Environment", "/etc/hosts changes (DNS hijack detection)"],
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      {/* Header */}
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">Security</p>
      <h1 className="mb-4 text-3xl font-bold text-fg-primary">Security overview</h1>
      <p className="mb-12 max-w-2xl text-base text-fg-muted">
        BLACKGLASS is a configuration-integrity product. This page describes what it does to
        improve your security posture — and how we protect the data you entrust to us.
      </p>

      <div className="space-y-14">
        {/* Section 1 — What BLACKGLASS does */}
        <section aria-labelledby="what-it-does">
          <SectionHeading>
            <span id="what-it-does">What BLACKGLASS does for security</span>
          </SectionHeading>

          <div className="rounded-lg border border-border-subtle bg-bg-panel/60 px-5 py-4 mb-8">
            <p className="text-sm font-semibold text-fg-primary">Integrity first, monitoring second</p>
            <Prose>
              BLACKGLASS is not a SIEM, a vulnerability scanner, or a log aggregator. It is a
              configuration-integrity product. Its job is to answer one question:{" "}
              <em className="text-fg-primary not-italic">
                is this host still in the configuration we approved, and if not, what changed,
                when, and why does it matter?
              </em>{" "}
              Every feature — baselines, drift detection, risk classification, evidence export —
              exists to answer that question reliably and with an auditable record.
            </Prose>
          </div>

          <div className="space-y-8">
            <div>
              <p className="text-sm font-semibold text-fg-primary">Baseline creation</p>
              <Prose>
                A baseline is a point-in-time snapshot of a host&apos;s security-relevant
                configuration: listening ports, local users and group memberships, sudo rules,
                enabled systemd units, SSH daemon policy, firewall rules, installed packages, and
                kernel parameters. Without an explicit baseline, drift is undetectable — you cannot
                tell whether a new port or user is authorised or a sign of compromise. Baselines
                are also compliance evidence: proof that a system was in an acceptable state at a
                specific time.
              </Prose>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Drift detection</p>
              <Prose>
                At each scan, BLACKGLASS re-collects the same surface areas and diffs against the
                active baseline. Every changed, added, or removed item surfaces as a finding.
                Configuration drift is a well-documented attack vector — attackers abuse CI
                pipelines, provisioning scripts, and emergency access to make changes that are
                never reviewed or reverted. BLACKGLASS makes that drift visible and attributable.
              </Prose>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border-default">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-default bg-bg-elevated">
                      <th className="px-4 py-2.5 text-left font-semibold text-fg-primary">Category</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-fg-primary">What is detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DRIFT_CATEGORIES.map(([cat, desc], i) => (
                      <tr
                        key={cat}
                        className={i % 2 === 0 ? "bg-bg-base" : "bg-bg-panel/40"}
                      >
                        <td className="px-4 py-2.5 font-medium text-fg-primary">{cat}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Risk classification</p>
              <Prose>
                Raw findings are classified into categories that map to standard security risk
                taxonomy:{" "}
                <strong className="text-fg-primary font-medium">network exposure</strong>,{" "}
                <strong className="text-fg-primary font-medium">identity drift</strong>,{" "}
                <strong className="text-fg-primary font-medium">persistence</strong>,{" "}
                <strong className="text-fg-primary font-medium">policy mismatch</strong>, and{" "}
                <strong className="text-fg-primary font-medium">package / supply-chain changes</strong>.
                Classification tells a responder whether a finding is a potential
                lateral-movement vector, a compliance gap, or a sign of attacker activity — so
                teams can triage rather than guess.
              </Prose>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Evidence and reporting</p>
              <BulletList
                items={[
                  "Host baseline report — structured record of what the host looked like at baseline time, suitable for a change record or audit questionnaire",
                  "Drift report — timestamped diff between baseline and current state, with risk classification and recommended response",
                  "Fleet posture summary — across all enrolled hosts: unacknowledged drift by category and severity, with trending",
                  "Evidence bundles — exportable packages containing baseline, findings, acknowledgements, and operator notes for SOC 2, post-incident review, or CAB submission",
                  "Audit timeline — chronological view of what changed on each host across all scans",
                ]}
              />
            </div>
          </div>
        </section>

        {/* Section 2 — How we protect your data */}
        <section aria-labelledby="data-protection">
          <SectionHeading>
            <span id="data-protection">How BLACKGLASS protects your data</span>
          </SectionHeading>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DomainCard title="Encryption and transport">
              All UI and API traffic is served over HTTPS / TLS 1.3. There are no HTTP endpoints.
              Drift results, baselines, evidence bundles, and audit logs are encrypted at rest
              (AES-256). Encryption is always on — not an option.
            </DomainCard>

            <DomainCard title="Access control">
              Three built-in roles:{" "}
              <strong className="text-fg-primary font-medium">Viewer</strong> (read-only),{" "}
              <strong className="text-fg-primary font-medium">Operator</strong> (scan + acknowledge), and{" "}
              <strong className="text-fg-primary font-medium">Admin</strong> (full access). API tokens are
              scoped to a role at issuance. Enterprise adds SSO / SAML / OIDC with MFA enforced at
              your identity provider.
            </DomainCard>

            <DomainCard title="Data minimisation and retention">
              BLACKGLASS collects only what is needed to compute drift — not file contents, not
              environment variables, not secrets. Retention is configurable per plan (30 days free,
              180 days Pro, custom on Enterprise). Data is hard-deleted after the window closes —
              not hidden, removed.
            </DomainCard>

            <DomainCard title="Secrets and credential handling">
              SSH credentials are never stored. They are fetched just-in-time from a pluggable
              SecretProvider (Doppler, Infisical, Vault, or env vars for dev), held in memory only
              for the scan connection lifetime, and never written to disk or logs. The browser never
              sees raw credentials.
            </DomainCard>

            <DomainCard title="Audit logging">
              Every security-relevant action is recorded: authentication, scan execution, baseline
              changes, drift acknowledgement, evidence export, and user management. Logs are
              append-only at the application layer and kept separate from raw operational output.
              No host configuration data is written to application logs.
            </DomainCard>

            <DomainCard title="Platform hardening">
              The service runs on hardened cloud infrastructure with network segmentation and
              SSH-key management access. All secrets are managed via a secrets manager — none are
              committed to source control. Dependencies are pinned and reviewed on a regular
              vulnerability cadence. Tenant data is scoped by workspace at the application layer.
            </DomainCard>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-lg border border-border-default bg-bg-panel px-6 py-8">
          <h2 className="text-base font-semibold text-fg-primary">Ready to start monitoring?</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Connect your first host in minutes. No agents. No open inbound ports.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="rounded-md bg-accent-blue px-4 py-2 text-sm font-semibold text-white hover:bg-accent-blue-hover"
            >
              View plans
            </Link>
            <Link
              href="/product"
              className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-fg-primary hover:bg-bg-elevated"
            >
              See the product →
            </Link>
          </div>
        </section>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-6 text-xs text-fg-faint">
          <span>Questions?{" "}
            <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
              jamie@obsidiandynamics.co.uk
            </a>
          </span>
          <span>·</span>
          <Link href="/privacy" className="text-accent-blue hover:underline">Privacy policy</Link>
          <span>·</span>
          <Link href="/terms" className="text-accent-blue hover:underline">Terms</Link>
          <span>·</span>
          <Link href="/dpa" className="text-accent-blue hover:underline">DPA</Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} Obsidian Dynamics Limited (Co. No. 16663833)</span>
        </div>
      </div>
    </main>
  );
}
