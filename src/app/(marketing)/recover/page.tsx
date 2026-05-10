import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in help · Blackglass",
  description:
    "Reset your workspace password (Clerk) or recover a shared deployment passphrase. First-party help — no GitHub required.",
  robots: { index: true, follow: true },
};

export default function RecoverPage() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">Access</p>
      <h1 className="mb-3 text-2xl font-bold text-fg-primary">Sign-in help</h1>
      <p className="mb-10 text-fg-muted">
        Pick the path that matches how <span className="text-fg-primary">you</span> sign in. If you
        are not sure, try the workspace account (email) section first when it appears on this page.
      </p>

      {clerkEnabled ? (
        <section className="mb-12 space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-base font-semibold text-fg-primary">Workspace account (email)</h2>
          <p>
            If your team uses the email sign-in page at{" "}
            <Link href="/sign-in" className="text-accent-blue hover:underline">
              /sign-in
            </Link>
            , your account is managed by Clerk. Blackglass does not store your password; reset is
            done with a secure link sent to your email.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open{" "}
              <Link href="/sign-in" className="text-accent-blue hover:underline">
                Sign in
              </Link>
              .
            </li>
            <li>Enter the email address you use for Blackglass.</li>
            <li>
              On the password step, use <strong className="text-fg-primary">Forgot password?</strong>{" "}
              (or the equivalent in the embedded form). Clerk will email you a one-time link to
              choose a new password.
            </li>
            <li>Check spam or quarantine if nothing arrives within a few minutes.</li>
          </ol>
          <p className="text-xs text-fg-faint">
            Use Google or enterprise SSO? Use the same &ldquo;Sign in&rdquo; page and the provider
            button you normally use. If SSO fails, contact your organisation&rsquo;s Blackglass
            admin — we cannot reset IdP access from this product.
          </p>
          <div>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-card bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Go to sign in
            </Link>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">Shared passphrase ({`/login`})</h2>
        <p>
          Some deployments use a single shared passphrase at{" "}
          <Link href="/login" className="text-accent-blue hover:underline">
            /login
          </Link>{" "}
          instead of per-user accounts. There is no automated email reset for that mode — the
          credential lives in your hosting provider as{" "}
          <code className="rounded bg-bg-elevated px-1 font-mono text-xs text-fg-primary">
            AUTH_ADMIN_PASSWORD
          </code>
          .
        </p>
        <p>
          <Link href="/passphrase-recovery" className="text-accent-blue hover:underline">
            Passphrase recovery and rotation
          </Link>{" "}
          (lockout, DigitalOcean, and when you are already signed in).
        </p>
      </section>

      <nav className="mt-12 flex flex-wrap gap-4 text-xs text-fg-faint">
        {clerkEnabled ? (
          <Link href="/sign-in" className="text-accent-blue hover:underline">
            Email sign-in
          </Link>
        ) : null}
        <Link href="/login" className="text-accent-blue hover:underline">
          Passphrase sign-in
        </Link>
        <Link href="/" className="text-accent-blue hover:underline">
          Home
        </Link>
      </nav>
    </main>
  );
}
