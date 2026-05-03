import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Security | BLACKGLASS",
  description:
    "How BLACKGLASS handles tenant isolation, MFA, role-based access, audit logging, secrets management, and collector-side data handling.",
  openGraph: {
    title: "Security | BLACKGLASS",
    description:
      "Tenant isolation with Postgres RLS, mandatory MFA via Clerk, RBAC enforced server-side, full audit logs, and secrets never touching application storage.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-14 text-sm leading-relaxed text-fg-muted">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Trust
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-fg-primary">Security overview</h1>
        <p className="mt-4">
          BLACKGLASS is built for operators who are rightly sceptical of new control-plane tools. This
          page describes the concrete controls in place — not aspirational certifications.
        </p>

        {/* Tenant isolation */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Tenant isolation</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg-primary">Postgres row-level security (RLS).</strong> Every
            workspace-scoped table is protected by RLS policies. A database query in the context of
            Workspace A cannot return rows belonging to Workspace B — even if application code
            contains a bug that omits a <code className="font-mono text-accent-blue">WHERE workspace_id = ?</code>{" "}
            clause. Tenant isolation is enforced at the persistence layer, not only in application logic.
          </li>
          <li>
            Workspace membership and role assignments are verified server-side on every privileged
            request. They cannot be bypassed from the browser or by manipulating request parameters.
          </li>
          <li>
            The{" "}
            <Link href="/demo" className="text-accent-blue hover:underline">public demo</Link>{" "}
            is a fully local, seeded workspace — it never connects to production data or
            infrastructure. No authentication is required to explore it.
          </li>
        </ul>

        {/* Identity & access */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Identity &amp; access</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Sign-in, workspace organisations, and session management are handled by{" "}
            <strong className="text-fg-primary">Clerk</strong> — a dedicated identity provider. No
            passwords are stored directly in BLACKGLASS.
          </li>
          <li>
            <strong className="text-fg-primary">MFA is mandatory</strong> — TOTP-first with SMS
            fallback and backup codes. We do not issue long-lived API tokens to end users.
          </li>
          <li>
            <strong className="text-fg-primary">Role-based access control (RBAC)</strong> covers five
            roles: owner, admin, operator, viewer, and guest auditor. Each role has a distinct
            permission set enforced server-side for every privileged action.
          </li>
          <li>
            Viewers and guest auditors are read-only. They cannot run scans, modify baselines, manage
            members, or access billing. They are unlimited on paid plans.
          </li>
          <li>
            Session tokens are short-lived. Step-up authentication can be required for sensitive
            mutations on Enterprise plans.
          </li>
        </ul>

        {/* Data handling */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Data handling</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg-primary">Collectors are scoped to metadata.</strong> The SSH
            collector gathers configuration state required for drift detection: effective SSH
            directives (via <code className="font-mono text-accent-blue">sshd -T</code>), sysctl
            values, open listeners, and service states. It does not read application configuration
            files, environment variables, or SSH private keys into BLACKGLASS storage.
          </li>
          <li>
            <strong className="text-fg-primary">Least-privilege collector account.</strong> The
            recommended setup uses a dedicated{" "}
            <code className="font-mono text-accent-blue">blackglass-collector</code> user with no
            sudo rights and an SSH key scoped to that account only.
          </li>
          <li>
            All data in transit uses TLS. Data at rest is encrypted at the infrastructure layer.
          </li>
          <li>
            Secrets — Stripe keys, database credentials, webhook signing secrets — are managed via{" "}
            <strong className="text-fg-primary">Doppler</strong> (secrets management platform) and
            are never committed to source control or application logs.
          </li>
          <li>
            Audit and security events are emitted for every privileged action. Secrets and sensitive
            values are never included in log payloads.
          </li>
        </ul>

        {/* Audit logging */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Audit logging</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Audit events are recorded for: workspace member invites and role changes, scan
            initiations, baseline captures and updates, drift event lifecycle (open, acknowledge,
            close), evidence bundle exports, and billing-related events.
          </li>
          <li>
            Each audit event records the acting operator, timestamp, target resource, and outcome.
          </li>
          <li>
            Audit log export is available on Growth and above plans. On Enterprise, immutable audit
            log retention can be configured.
          </li>
        </ul>

        {/* Collector security */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Collector security model</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg-primary">Agentless (pull):</strong> Blackglass connects to
            hosts over SSH using a dedicated, least-privilege collector account. The connection is
            short-lived — initiated on demand or on schedule — and does not maintain a persistent
            tunnel.
          </li>
          <li>
            <strong className="text-fg-primary">Agent (push):</strong> For hosts that cannot accept
            inbound SSH from the control plane, a lightweight push-ingest agent can be deployed.
            It sends scan results to the Blackglass ingest API over HTTPS using a workspace-scoped
            token.
          </li>
          <li>
            Collector credentials (SSH keys or ingest tokens) are stored encrypted and are rotatable
            from the workspace settings without downtime.
          </li>
        </ul>

        {/* Responsible disclosure */}
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Responsible disclosure</h2>
        <p className="mt-3">
          If you find a security issue in BLACKGLASS, please report it to{" "}
          <a href="mailto:security@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
            security@obsidiandynamics.co.uk
          </a>
          . We aim to acknowledge reports within 2 business days and provide an initial assessment
          within 5 business days.
        </p>

        <p className="mt-10">
          <Link href="/" className="text-accent-blue hover:underline">
            ← Home
          </Link>
          {" · "}
          <Link href="/product" className="text-accent-blue hover:underline">
            Product overview
          </Link>
          {" · "}
          <Link href="/demo" className="text-accent-blue hover:underline">
            Explore demo
          </Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

