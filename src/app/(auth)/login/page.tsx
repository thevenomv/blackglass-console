import { signIn } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; redirected?: string }>;
}) {
  const { next, error, redirected } = await searchParams;
  const safePath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-md rounded-card border border-border-default bg-bg-panel p-8 shadow-elevated">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
          BLACKGLASS
        </p>
        <h1 className="mt-3 text-xl font-semibold text-fg-primary">Sign in</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Enter your passphrase to access the console.
        </p>
        {redirected === "1" && !error && (
          <p className="mt-4 rounded-card border border-border-default bg-bg-elevated px-3 py-2 text-sm text-fg-muted">
            Sign in to continue.
          </p>
        )}
        {error === "invalid_credentials" && (
          <p className="mt-4 rounded-card border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            Incorrect passphrase. Please try again.
          </p>
        )}
        {error === "too_many_attempts" && (
          <p className="mt-4 rounded-card border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            Too many login attempts. Please wait 15 minutes before trying again.
          </p>
        )}
        {error === "invalid_invite" && (
          <p className="mt-4 rounded-card border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            This invite link is invalid or has already been used. Contact your administrator for a new link.
          </p>
        )}
        <form action={signIn} className="mt-8 space-y-4">
          {safePath && (
            <input type="hidden" name="next" value={safePath} />
          )}
          <label className="block text-xs text-fg-faint" htmlFor="login-password">
            Passphrase
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-label="Passphrase"
              autoFocus
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
            />
          </label>
          <Button type="submit" className="w-full">
            Continue to console
          </Button>
        </form>
      </div>
    </div>
  );
}
