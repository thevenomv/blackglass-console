import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shared passphrase recovery · Blackglass",
  description:
    "Recover or rotate the shared console passphrase (AUTH_ADMIN_PASSWORD) for deployments that use /login.",
  robots: { index: true, follow: true },
};

export default function PassphraseRecoveryPage() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-fg-muted">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-fg-faint">Access</p>
      <h1 className="mb-3 text-2xl font-bold text-fg-primary">Shared passphrase recovery</h1>
      <p className="mb-8">
        This page applies only if your deployment signs in at{" "}
        <Link href="/login" className="text-accent-blue hover:underline">
          /login
        </Link>{" "}
        with one organisation passphrase.{" "}
        {clerkEnabled ? (
          <>
            If you normally use{" "}
            <Link href="/sign-in" className="text-accent-blue hover:underline">
              email sign-in
            </Link>
            , use{" "}
            <Link href="/recover" className="text-accent-blue hover:underline">
              Sign-in help
            </Link>{" "}
            instead—Clerk handles password reset.
          </>
        ) : null}
      </p>

      <section className="mb-10 space-y-3 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">Locked out completely</h2>
        <p>
          The passphrase is a deployment secret — we cannot read it back or email it. Someone with
          access to your hosting provider must set a new value for{" "}
          <code className="rounded bg-bg-elevated px-1 font-mono text-xs">AUTH_ADMIN_PASSWORD</code>{" "}
          and let the app redeploy.
        </p>
        <p className="font-medium text-fg-primary">DigitalOcean App Platform (typical)</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open{" "}
            <a
              href="https://cloud.digitalocean.com/apps"
              className="text-accent-blue hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              cloud.digitalocean.com → Apps
            </a>
            .
          </li>
          <li>
            Select this app (e.g. <span className="text-fg-primary">blackglass</span>) →{" "}
            <strong>Settings</strong> → <strong>Components</strong> → <strong>web</strong> →{" "}
            <strong>Environment Variables</strong>.
          </li>
          <li>
            Edit <code className="font-mono text-xs">AUTH_ADMIN_PASSWORD</code>, set a new strong
            value, <strong>Save</strong>. Wait for the deployment to become <strong>ACTIVE</strong>{" "}
            (usually a few minutes).
          </li>
          <li>
            Sign in at{" "}
            <Link href="/login" className="text-accent-blue hover:underline">
              /login
            </Link>{" "}
            with the new passphrase.
          </li>
        </ol>
      </section>

      <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">Already signed in</h2>
        <p>
          If you can open the console, ask a deployment admin to rotate{" "}
          <code className="rounded bg-bg-elevated px-1 font-mono text-xs">AUTH_ADMIN_PASSWORD</code>{" "}
          in the same place when you need to roll the passphrase without a full lockout.
        </p>
      </section>

      <p className="mt-10 text-xs text-fg-faint">
        Operator documentation with API/script options:{" "}
        <span className="font-mono text-[11px]">docs/passphrase-recovery.md</span> in the repo.
      </p>

      <nav className="mt-6 flex flex-wrap gap-4 text-xs">
        <Link href="/recover" className="text-accent-blue hover:underline">
          All sign-in options
        </Link>
        <Link href="/login" className="text-accent-blue hover:underline">
          Passphrase sign-in
        </Link>
      </nav>
    </main>
  );
}
