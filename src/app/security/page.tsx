import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Security | BLACKGLASS",
  description: "How BLACKGLASS handles authentication, tenancy, audit logging, and data handling.",
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
          BLACKGLASS is built for operators who are rightly sceptical of new control-plane tools. We
          focus on concrete controls — not brochure certifications.
        </p>
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Identity &amp; access</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Sign-in, workspace organisations, and sessions are handled by a dedicated identity
            provider — no passwords stored directly in BLACKGLASS.
          </li>
          <li>
            <strong className="text-fg-primary">MFA is mandatory</strong> — TOTP-first with SMS
            fallback and backup codes. We do not issue long-lived API tokens to end users.
          </li>
          <li>
            Role-based access (owner, admin, operator, viewer, guest auditor) is enforced
            server-side for every privileged action — it cannot be bypassed from the browser.
          </li>
        </ul>
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Data handling</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Baseline and drift metadata are <strong className="text-fg-primary">tenant-scoped</strong>{" "}
            at the persistence layer.
          </li>
          <li>
            Collectors gather configuration state needed for drift — not arbitrary file contents,
            application secrets, or SSH private keys stored in BLACKGLASS.
          </li>
          <li>Audit and security events are emitted for investigations; secrets never go in logs.</li>
        </ul>
        <h2 className="mt-10 text-base font-semibold text-fg-primary">Demo vs production</h2>
        <p className="mt-3">
          The <Link href="/demo" className="text-accent-blue hover:underline">public demo</Link> is a
          fully local, seeded narrative — it never connects to your infrastructure. Real scans and
          persistence require an authenticated workspace.
        </p>
        <p className="mt-8">
          <Link href="/" className="text-accent-blue hover:underline">
            ← Home
          </Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
