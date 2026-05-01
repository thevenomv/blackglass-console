import { signIn } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-md rounded-card border border-border-default bg-bg-panel p-8 shadow-elevated">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
          BLACKGLASS
        </p>
        <h1 className="mt-3 text-xl font-semibold text-fg-primary">Operator sign-in</h1>
        <p className="mt-2 text-sm text-fg-muted">
          RBAC stub: choose a role for cookie-backed permissions. With{" "}
          <span className="font-mono text-fg-primary">AUTH_REQUIRED=false</span>, unsigned sessions
          default to <span className="font-mono">admin</span> for full console access.
        </p>
        <form action={signIn} className="mt-8 space-y-4">
          <label className="block text-xs text-fg-faint" htmlFor="login-email">
            Identity (stub)
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@infra.team"
              aria-label="Email address"
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
            />
          </label>
          <label className="block text-xs text-fg-faint" htmlFor="login-password">
            Passphrase (stub — not validated)
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-label="Passphrase"
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
            />
          </label>
          <label className="block text-xs text-fg-faint">
            Role
            <select
              name="role"
              defaultValue="operator"
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            >
              <option value="auditor">Auditor (read + export)</option>
              <option value="operator">Operator (integrity actions)</option>
              <option value="admin">Admin (includes key rotation)</option>
            </select>
          </label>
          <Button type="submit" className="w-full">
            Continue to console
          </Button>
        </form>
      </div>
    </div>
  );
}
