import type { Metadata } from "next";
import Link from "next/link";
import { RecoverEffects } from "./RecoverEffects";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Can't sign in? · Blackglass",
  description:
    "Recover workspace access: reset your email password via Clerk, or rotate the shared deployment passphrase.",
  alternates: { canonical: canonical("/recover") },
  robots: { index: true, follow: true },
};

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());

  return (
    <>
      <RecoverEffects section={section} />
      <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">Help</p>
        <h1 className="mb-3 text-2xl font-bold text-fg-primary">Can&apos;t sign in?</h1>
        <p className="mb-8 max-w-xl">
          Pick the situation that matches yours — each section is independent. Nothing here sends you
          in circles to another help page.
        </p>

        {clerkEnabled ? (
          <div className="mb-10 grid gap-3 sm:grid-cols-2">
            <a
              href="#workspace"
              className="rounded-card border border-border-default bg-bg-panel p-5 transition-colors hover:border-accent-blue/35 hover:bg-bg-elevated"
            >
              <p className="text-sm font-semibold text-fg-primary">Work email or SSO</p>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                You normally open <span className="text-fg-primary">/sign-in</span> and enter your
                email (or use Google / SAML).
              </p>
            </a>
            <a
              href="#passphrase"
              className="rounded-card border border-border-default bg-bg-panel p-5 transition-colors hover:border-accent-blue/35 hover:bg-bg-elevated"
            >
              <p className="text-sm font-semibold text-fg-primary">Shared passphrase</p>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                Your organisation uses one passphrase at <span className="text-fg-primary">/login</span>{" "}
                instead of personal accounts.
              </p>
            </a>
          </div>
        ) : (
          <p className="mb-10 rounded-card border border-border-default bg-bg-panel px-4 py-3 text-sm">
            This deployment uses a shared passphrase — skip to{" "}
            <a href="#passphrase" className="text-accent-blue hover:underline">
              passphrase help
            </a>
            .
          </p>
        )}

        {clerkEnabled ? (
          <section
            id="workspace"
            tabIndex={-1}
            className="scroll-mt-28 space-y-4 border-t border-border-subtle pt-10 outline-none"
          >
            <h2 className="text-lg font-semibold text-fg-primary">Work email or SSO</h2>
            <p>
              Accounts are handled by Clerk — Blackglass never stores your password. Use the forgot-
              password flow on the sign-in screen and check your inbox (including spam).
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open sign-in.</li>
              <li>Enter your email and continue until you see the password field.</li>
              <li>
                Choose <strong className="text-fg-primary">Forgot password?</strong> (wording may vary
                slightly). Clerk emails you a secure link to set a new password.
              </li>
            </ol>
            <p className="text-xs text-fg-faint">
              SSO or Google? Use the same provider buttons as usual on sign-in. If the identity
              provider rejects you, your IT admin has to fix IdP access — not something we can reset
              from Blackglass.
            </p>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-card bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Open sign-in
            </Link>
          </section>
        ) : null}

        <section
          id="passphrase"
          tabIndex={-1}
          className={`scroll-mt-28 space-y-5 border-t border-border-subtle pt-10 outline-none ${clerkEnabled ? "mt-12" : ""}`}
        >
          <h2 className="text-lg font-semibold text-fg-primary">Shared passphrase (/login)</h2>
          <p>
            Some teams sign in at{" "}
            <Link href="/login" className="text-accent-blue hover:underline">
              /login
            </Link>{" "}
            with one passphrase for the whole deployment. That value is not recoverable by email — it
            lives only in your hosting provider as{" "}
            <code className="rounded bg-bg-elevated px-1 font-mono text-xs text-fg-primary">
              AUTH_ADMIN_PASSWORD
            </code>
            .
          </p>

          <div className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
            <h3 className="text-sm font-semibold text-fg-primary">Locked out</h3>
            <p>
              Someone with access to the deployment must set a new passphrase and wait for the app to
              finish redeploying.
            </p>
            <p className="font-medium text-fg-primary">DigitalOcean App Platform</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Open{" "}
                <a
                  href="https://cloud.digitalocean.com/apps"
                  className="text-accent-blue hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apps in the DigitalOcean control panel
                </a>
                .
              </li>
              <li>
                Select your Blackglass app → <strong>Settings</strong> → <strong>Components</strong>{" "}
                → <strong>web</strong> → <strong>Environment Variables</strong>.
              </li>
              <li>
                Edit <code className="font-mono text-xs">AUTH_ADMIN_PASSWORD</code>, save a new
                strong value, then wait until the deployment shows <strong>ACTIVE</strong>.
              </li>
              <li>
                Sign in at{" "}
                <Link href="/login" className="text-accent-blue hover:underline">
                  /login
                </Link>{" "}
                with the new passphrase.
              </li>
            </ol>
          </div>

          <div className="space-y-2 rounded-card border border-border-default bg-bg-panel p-5">
            <h3 className="text-sm font-semibold text-fg-primary">Already signed in</h3>
            <p>
              Ask whoever operates the deployment to rotate{" "}
              <code className="rounded bg-bg-elevated px-1 font-mono text-xs">AUTH_ADMIN_PASSWORD</code>{" "}
              in the same screen when you want to roll the passphrase without being locked out.
            </p>
          </div>

          <p className="text-xs text-fg-faint">
            Advanced options (API / CLI / scripts): see{" "}
            <span className="font-mono text-[11px]">docs/security/passphrase-recovery.md</span> in the source
            repository.
          </p>
        </section>

        <nav className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t border-border-subtle pt-8 text-xs text-fg-faint">
          <Link href="/login" className="text-accent-blue hover:underline">
            /login
          </Link>
          {clerkEnabled ? (
            <Link href="/sign-in" className="text-accent-blue hover:underline">
              /sign-in
            </Link>
          ) : null}
          <Link href="/" className="text-accent-blue hover:underline">
            Home
          </Link>
        </nav>
      </main>
    </>
  );
}
