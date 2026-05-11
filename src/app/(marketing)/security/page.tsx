import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbSchema, canonical, defaultOgImages } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "Security — Blackglass by Obsidian Dynamics",
  description:
    "How Blackglass keeps your Linux visibility data safe — in plain language up top, with technical depth for security reviewers below.",
  alternates: { canonical: canonical("/security") },
  openGraph: {
    title: "Security — Blackglass",
    description:
      "Encryption, access control, careful handling of credentials, audit trails, and platform hardening — explained for both executives and engineers.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/security"),
    images: defaultOgImages(),
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
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Security", url: "/security" },
        ])}
      />
      {/* Header */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-faint">Security</p>
      <h1 className="mb-4 text-3xl font-bold text-fg-primary">Security overview</h1>
      <p className="max-w-2xl text-base text-fg-muted">
        Blackglass helps you notice when Linux servers move away from the configuration you
        approved. This page explains what that means for your risk — and how we safeguard the
        information you share with us.
      </p>

      <div className="mb-10 mt-6 max-w-2xl rounded-lg border border-accent-blue/25 bg-accent-blue/5 px-5 py-4 text-sm leading-relaxed text-fg-muted">
        <p className="font-semibold text-fg-primary">In plain language</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>We show you what changed, why it matters, and who touched it — with exports you can hand to leadership.</li>
          <li>Your workspace stays separate from everyone else&apos;s, with encryption in transit and at rest.</li>
          <li>Automation that suggests fixes is designed so humans stay in charge; nothing runs on production without an explicit approval path.</li>
          <li>Need the engineering detail? Everything below this box is the deeper dive security teams usually ask for.</li>
        </ul>
      </div>

      <div className="space-y-14">
        {/* Section 1 — What Blackglass does */}
        <section aria-labelledby="what-it-does">
          <SectionHeading>
            <span id="what-it-does">What Blackglass does for security</span>
          </SectionHeading>

          <div className="rounded-lg border border-border-subtle bg-bg-panel/60 px-5 py-4 mb-8">
            <p className="text-sm font-semibold text-fg-primary">Integrity first, monitoring second</p>
            <Prose>
              Blackglass is not a SIEM, a vulnerability scanner, or a log aggregator. It is a
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
                configuration: listening ports, local users and group memberships, sudo policy,
                enabled systemd units, sshd effective configuration, firewall rules where
                collected, cron entries, installed packages, loaded kernel modules, and file
                integrity hashes for critical paths. Without an explicit baseline, drift is
                undetectable — you cannot tell whether a new port or user is authorised or a sign
                of compromise. Baselines are also compliance evidence: proof that a system was in
                an acceptable state at a specific time.
              </Prose>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg-primary">Drift detection</p>
              <Prose>
                At each scan, Blackglass re-collects the same surface areas and diffs against the
                active baseline. Every changed, added, or removed item surfaces as a finding.
                Configuration drift is a well-documented attack vector — attackers abuse CI
                pipelines, provisioning scripts, and emergency access to make changes that are
                never reviewed or reverted. Blackglass makes that drift visible and attributable.
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

        {/* Section 1b — Agentic AI safety (the remediator) */}
        <section aria-labelledby="ai-safety">
          <SectionHeading>
            <span id="ai-safety">Agentic AI safety</span>
          </SectionHeading>

          <div className="rounded-lg border border-border-subtle bg-bg-panel/60 px-5 py-4 mb-6">
            <p className="text-sm font-semibold text-fg-primary">
              The remediator never runs AI-generated commands directly on production.
            </p>
            <Prose>
              Blackglass includes an LLM-driven remediator that proposes plans for
              detected drift. It is the most-asked-about component in security review
              — so the safety contract is uncompromising and enforced in code, not in
              the prompt.
            </Prose>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DomainCard title="4-tier risk policy">
              Every drift event is classified by category + severity into one of:
              guidance-only, sandbox-verifiable, approval-required, or manual-only.
              Classification is application logic — the LLM cannot see, override, or
              argue with the tier assignment.
            </DomainCard>

            <DomainCard title="Auto-escalation on dangerous verbs">
              Even when category resolves to sandbox-verifiable, any plan that
              contains <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">sudo</code>,{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">systemctl stop|disable|mask</code>,
              SSH service restart, or user/group mutation is auto-promoted to
              approval-required. Tier never moves down.
            </DomainCard>

            <DomainCard title="Forbidden-command registry">
              Hard-coded denylist blocks{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">rm -rf /</code>,{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">curl | bash</code>,
              firewall takedown, sudoers truncation, SSH service stop, SELinux
              disable, and every variant in between. Plans containing any pattern are
              rejected wholesale — no &quot;sanitisation&quot; gymnastics.
            </DomainCard>

            <DomainCard title="Sandbox verification">
              Plans permitted to run are executed in an ephemeral DigitalOcean
              droplet outside the customer&apos;s network — no SSH access to
              production, no production credentials, destroyed within 10 minutes.
              Failed verification means the plan never reaches the operator.
            </DomainCard>

            <DomainCard title="HMAC Approval Token (default-on)">
              When the operator clicks Approve in the Console, an HMAC-SHA256 token
              binding{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">
                {`{recommendation_id, tenant_id, decision, exp}`}
              </code>{" "}
              is signed and forwarded to the Remediator. The Remediator verifies the
              token before recording the approval. A leaked Remediator API key alone
              is insufficient to fabricate approvals.
            </DomainCard>

            <DomainCard title="Per-category confidence caps">
              The LLM&apos;s self-reported confidence score is clamped to a
              per-category ceiling — kernel ≤ 30%, identity ≤ 70%, SSH ≤ 85%, etc.
              Capped scores surface in the UI with a visible badge so operators see
              &quot;Confidence 30% (capped)&quot; rather than a silent score change.
            </DomainCard>
          </div>

          <p className="mt-4 text-xs text-fg-faint">
            The remediator safety model covers the end-to-end HITL flow and the
            threat-mitigation matrix for the Approval Token. Ask your Blackglass
            contact if you need the full technical write-up for review.
          </p>
        </section>

        {/* Section 2 — How we protect your data */}
        <section aria-labelledby="data-protection">
          <SectionHeading>
            <span id="data-protection">How Blackglass protects your data</span>
          </SectionHeading>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DomainCard title="Encryption and transport">
              All UI and API traffic is served over HTTPS / TLS 1.3. There are no HTTP endpoints.
              Drift results, baselines, evidence bundles, and audit logs are encrypted at rest
              (AES-256). SSH credentials use envelope encryption with a configurable KMS backend
              (local key, HashiCorp Vault, or AWS KMS) — only the data key is unwrapped per scan.
              Encryption is always on — not an option.
            </DomainCard>

            <DomainCard title="Access control (Clerk Enterprise)">
              Authentication is delivered by Clerk Enterprise: SAML / OIDC SSO, SCIM provisioning,
              MFA enforcement, and revocable API keys scoped at issuance. Built-in RBAC roles —{" "}
              <strong className="text-fg-primary font-medium">viewer</strong>,{" "}
              <strong className="text-fg-primary font-medium">guest auditor</strong>,{" "}
              <strong className="text-fg-primary font-medium">operator</strong>, and{" "}
              <strong className="text-fg-primary font-medium">admin</strong> — are enforced
              centrally; route handlers never duplicate authorisation logic.
            </DomainCard>

            <DomainCard title="Tenant isolation (RLS)">
              Multi-tenant data is isolated at the database layer using PostgreSQL row-level
              security policies on every tenant-owned table. The application sets the
              <code className="ml-1 rounded bg-bg-elevated px-1 py-0.5 text-[12px]">app.tenant_id</code>{" "}
              GUC on every authenticated request via a wrapper that has no escape hatches in
              business code. <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">BYPASSRLS</code>{" "}
              is reserved for migrations and inbound webhooks only.
            </DomainCard>

            <DomainCard title="Data minimisation and retention">
              Blackglass collects only what is needed to compute drift — not file contents, not
              environment variables, not secrets. Retention is configurable per plan (30 days on
              Lab and Starter; 180 days on Growth; 365 days on Scale and Business; custom on
              Enterprise). Data is hard-deleted after the window closes — not hidden, removed.
            </DomainCard>

            <DomainCard title="Secrets and credential handling">
              SSH credentials are never stored unencrypted. They are sealed via envelope encryption
              (Vault / AWS KMS / local KMS), unsealed in memory only for the scan connection
              lifetime, and never written to disk or logs. Other secrets are sourced from Doppler,
              Vault, env vars, or the database secret backend — pluggable per environment. The
              browser never sees raw credentials.
            </DomainCard>

            <DomainCard title="Immutable audit trail">
              Every security-relevant action is appended to the per-tenant{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">saas_audit_events</code>{" "}
              stream: authentication, scan execution, baseline changes, drift acknowledgement,
              evidence export, remediation approval, and user management. Streams export as
              deterministic NDJSON with a verifiable integrity digest
              (<code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">npm run audit:verify-jsonl</code>),
              suitable for cold storage and external review.
            </DomainCard>

            <DomainCard title="Signed outbound webhooks">
              Webhooks are HMAC-SHA256 signed with a per-tenant secret and rotation-aware (current
              and previous keys are accepted during rollover). Receivers can verify signatures
              independently. Drift-style events and optional Charon scan-complete payloads use the
              same signing headers. Inbound webhook idempotency is enforced via a Postgres dedup
              table to eliminate duplicate processing.
            </DomainCard>

            <DomainCard title="Charon (optional cloud inventory)">
              You may link read-scoped API credentials for DigitalOcean, AWS, or Google Cloud.
              They are envelope-encrypted like SSH keys, unsealed only for scan jobs. Our service
              calls vendor inventory APIs; findings, suppressions, and scan diffs stay inside your
              tenant boundary (Postgres RLS). Live resource deletion requires explicit approval when
              enabled on your plan — there is no silent autopilot.
            </DomainCard>

            <DomainCard title="Air-gapped mode">
              Setting{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">BLACKGLASS_AIRGAPPED=true</code>{" "}
              disables outbound calls to public services (Stripe, Sentry, telemetry,
              PostHog) on both backend AND browser. Modules fail fast rather than
              hang. The matching{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">/api/health/airgap?probe=true</code>{" "}
              endpoint actively self-tests the gate. Designed for regulated,
              on-premise, and classified deployments — including the self-hosted
              Helm chart.
            </DomainCard>

            <DomainCard title="Bring your own key (BYOK)">
              Enterprise tenants can wrap their own data-encryption keys with a
              tenant-specific KEK in AWS KMS or HashiCorp Vault. The wrapped DEK
              embeds the tenant id so legacy global-KEK blobs continue to round-trip
              safely after rollout. Configured under Settings → Identity → Bring
              your own key with a one-click round-trip verification flow.
            </DomainCard>

            <DomainCard title="HTTP security headers">
              Every response carries CSP (Report-Only by default), strict
              X-Content-Type-Options, Referrer-Policy, Permissions-Policy disabling
              camera / mic / geolocation, and Cross-Origin-Opener-Policy. The CSP
              whitelist is narrow — Stripe, Clerk, Sentry, plus self.
            </DomainCard>

            <DomainCard title="SAST + dependency scanning in CI">
              Semgrep with{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">p/owasp-top-ten</code>,{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">p/javascript</code>,{" "}
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-[12px]">p/typescript</code>,
              and a secrets ruleset runs on every push and weekly cron — fails CI
              on ERROR-severity findings and publishes SARIF for review.
              Dependabot watches both the Node and Python stacks daily.
            </DomainCard>

            <DomainCard title="Platform hardening and CI">
              The service runs on hardened cloud infrastructure with network segmentation. All
              secrets are managed via a secrets manager — none are committed to source control.
              Dependencies are pinned, scanned on every push (`npm audit`), and surfaced in a
              CycloneDX SBOM artefact. Staging is probed by an automated ZAP DAST baseline.
              Sentry + OpenTelemetry provide tagged error and trace observability per tenant.
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
          <Link href="/privacy" className="text-accent-blue hover:underline">Legal &amp; privacy</Link>
          <span>·</span>
          <Link href="/terms" className="text-accent-blue hover:underline">Terms</Link>
          <span>·</span>
          <Link href="/dpa" className="text-accent-blue hover:underline">DPA</Link>
          <span>·</span>
          <span>
            © {new Date().getFullYear()} Obsidian Dynamics Limited (Co. No. 16663833) · ICO{" "}
            <span className="whitespace-nowrap">ZC141175</span>
          </span>
        </div>
      </div>
    </main>
  );
}
