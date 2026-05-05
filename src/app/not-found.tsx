import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg-primary">Page not found</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        The URL may be mistyped, or the page was moved. Check the address or return to the console home.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
        >
          Marketing home
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
        >
          Fleet dashboard
        </Link>
      </div>
    </main>
  );
}
