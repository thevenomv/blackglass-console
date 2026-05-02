"use client";

import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-faint">
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-fg-muted">{children}</p>;
}

function DomainCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-bg-elevated p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-blue-soft text-accent-blue">
          {icon}
        </span>
        <p className="text-sm font-semibold text-fg-primary">{title}</p>
      </div>
      <div className="text-sm leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-fg-muted">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-blue" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function DriftTable() {
  const rows: { type: string; example: string }[] = [
    { type: "Network exposure", example: "New port 8080/tcp listening on 0.0.0.0 — not in baseline" },
    { type: "Identity drift", example: "New user deploy2 added to sudo group" },
    { type: "Persistence", example: "New systemd service enabled at boot — not in baseline" },
    { type: "SSH weakening", example: "PermitRootLogin changed from no to yes" },
    { type: "Firewall regression", example: "DROP policy on INPUT chain replaced with ACCEPT" },
    { type: "Package drift", example: "openssh-server downgraded from 9.3 to 8.9" },
  ];
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-border-subtle">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-base">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-faint">
              Drift category
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-faint">
              Example signal
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <tr key={r.type} className="bg-bg-panel">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg-primary">
                {r.type}
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{r.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external dep)
// ---------------------------------------------------------------------------

const icons = {
  lock: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path strokeLinecap="round" d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="6" cy="5" r="2.5" />
      <path strokeLinecap="round" d="M1 13c0-2.76 2.24-5 5-5" />
      <circle cx="11.5" cy="5.5" r="2" />
      <path strokeLinecap="round" d="M11.5 9c1.93 0 3.5 1.57 3.5 3.5" />
    </svg>
  ),
  clock: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="8" cy="8" r="6" />
      <path strokeLinecap="round" d="M8 5v3l2 2" />
    </svg>
  ),
  key: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="6" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M9 8h5M12 6v4" />
    </svg>
  ),
  log: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path strokeLinecap="round" d="M5 5h6M5 8h6M5 11h3" />
    </svg>
  ),
  shield: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2l5 2.5v4c0 3-2.5 5.5-5 6.5C5.5 13.5 3 11 3 8V4.5L8 2z" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function SecurityOverviewSection() {
  return (
    <CollapsibleSection title="Security overview — how BLACKGLASS works and protects your data" id="security-overview">
      <div className="space-y-8 py-2">

        {/* Narrative */}
        <div className="rounded-card border border-border-subtle bg-bg-base px-5 py-4">
          <p className="text-sm font-semibold text-fg-primary">
            Integrity first, monitoring second
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            BLACKGLASS is not a SIEM, a vulnerability scanner, or a log aggregator. It is a
            configuration-integrity product. Its job is to answer one question:{" "}
            <em className="text-fg-primary not-italic">
              is this host still in the configuration we approved, and if not, what changed, when,
              and why does it matter?
            </em>{" "}
            Every feature — baselines, drift detection, risk classification, evidence export — exists
            to answer that question reliably and with an auditable record.
          </p>
        </div>

        {/* Part 1: What it does */}
        <div>
          <SectionHeading>What BLACKGLASS does for security</SectionHeading>

          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-fg-primary">Baseline creation</p>
              <Prose>
                A baseline is a point-in-time snapshot of a host&apos;s security-relevant
                configuration: listening ports, local users and group memberships, sudo rules,
                enabled systemd units, SSH daemon policy, firewall rules, installed packages, and
                kernel parameters. Without an explicit baseline, drift is undetectable — you cannot
                tell whether a new port or user is authorized or a sign of compromise. Baselines are
                also compliance evidence: proof that a system was in an acceptable state at a
                specific time.
              </Prose>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Drift detection</p>
              <Prose>
                At each scan, BLACKGLASS re-collects the same surface areas and diffs against the
                active baseline. Every changed, added, or removed item surfaces as a finding.
                Configuration drift is a well-documented attack vector — attackers abuse CI
                pipelines, provisioning scripts, and emergency access to make changes that are never
                reviewed or reverted. BLACKGLASS makes that drift visible and attributable.
              </Prose>
              <DriftTable />
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Risk classification</p>
              <Prose>
                Raw findings are classified into categories that map to standard security risk
                taxonomy: <strong className="text-fg-primary font-medium">network exposure</strong>,{" "}
                <strong className="text-fg-primary font-medium">identity drift</strong>,{" "}
                <strong className="text-fg-primary font-medium">persistence</strong>,{" "}
                <strong className="text-fg-primary font-medium">policy mismatch</strong>, and{" "}
                <strong className="text-fg-primary font-medium">package / supply-chain changes</strong>.
                Classification tells a responder whether a finding is a potential lateral-movement
                vector, a compliance gap, or a sign of attacker activity — so teams can triage
                rather than guess.
              </Prose>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Evidence and reporting</p>
              <BulletList
                items={[
                  "Host baseline report — structured record of what the host looked like at baseline time, suitable for a change record or audit questionnaire",
                  "Drift report — timestamped diff between baseline and current state, with risk classification and recommended response",
                  "Fleet posture summary — across all enrolled hosts: unacknowledged drift by category and severity, with trending",
                  "Evidence bundles (Pro / Enterprise) — exportable packages containing baseline, findings, acknowledgements, and operator notes for SOC 2, post-incident review, or CAB submission",
                  "Audit timeline — chronological view of what changed on each host across all scans",
                ]}
              />
            </div>
          </div>
        </div>

        {/* Part 2: How we protect user data */}
        <div>
          <SectionHeading>How BLACKGLASS protects your data</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            <DomainCard icon={icons.lock} title="Encryption and transport">
              All UI and API traffic is served over HTTPS / TLS 1.3. There are no HTTP endpoints.
              Drift results, baselines, evidence bundles, and audit logs are encrypted at rest
              (AES-256). Encryption is always on — not an option.
            </DomainCard>

            <DomainCard icon={icons.users} title="Access control">
              Three built-in roles: <strong className="text-fg-primary font-medium">Viewer</strong>{" "}
              (read-only),{" "}
              <strong className="text-fg-primary font-medium">Operator</strong> (scan + acknowledge),
              and <strong className="text-fg-primary font-medium">Admin</strong> (full access). API
              tokens (Pro+) are scoped to a role at issuance. Enterprise adds SSO / SAML / OIDC with
              MFA enforced at your identity provider.
            </DomainCard>

            <DomainCard icon={icons.clock} title="Data minimisation and retention">
              BLACKGLASS collects only what is needed to compute drift — not file contents, not
              environment variables, not secrets. Retention is configurable per plan (30 days free,
              180 days Pro, custom on Enterprise). Data is hard-deleted after the window closes —
              not hidden, removed.
            </DomainCard>

            <DomainCard icon={icons.key} title="Secrets and credential handling">
              SSH credentials are never stored. They are fetched just-in-time from a pluggable
              SecretProvider (Doppler, Infisical, Vault, or env vars for dev), held in memory only
              for the scan connection lifetime, and never written to disk or logs. The browser never
              sees raw credentials.
            </DomainCard>

            <DomainCard icon={icons.log} title="Audit logging">
              Every security-relevant action is recorded: authentication, scan execution, baseline
              changes, drift acknowledgement, evidence export, and user management. Logs are
              append-only at the application layer, encrypted at rest, and kept separate from raw
              operational output. No host configuration data is written to application logs.
            </DomainCard>

            <DomainCard icon={icons.shield} title="Platform hardening">
              Production runs on DigitalOcean App Platform with network segmentation and SSH-key
              management access. All secrets are managed via Doppler — none are committed to source
              control. Dependencies are pinned and reviewed on a regular vulnerability cadence.
              Tenant data is scoped by workspace at the application layer.
            </DomainCard>

          </div>
        </div>

        {/* Footer links */}
        <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-4 text-xs text-fg-faint">
          <Link href="/pricing" className="text-accent-blue hover:underline">
            View plans
          </Link>
          <Link href="/settings" className="text-accent-blue hover:underline">
            Configure secrets backend
          </Link>
          <span>Questions? <a href="mailto:hello@blackglass.io" className="text-accent-blue hover:underline">hello@blackglass.io</a></span>
          <span className="text-fg-faint">·</span>
          <span>© {new Date().getFullYear()} Obsidian Dynamics Limited. BLACKGLASS is a product of Obsidian Dynamics Limited.</span>
        </div>

      </div>
    </CollapsibleSection>
  );
}
