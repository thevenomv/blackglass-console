import Link from "next/link";

export const metadata = {
  title: "Subscription confirmed — Blackglass",
};

export default function PricingSuccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6 py-20">
      <div className="w-full max-w-md rounded-card border border-border-default bg-bg-panel p-10 text-center">
        {/* Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <svg
            aria-hidden="true"
            className="h-7 w-7 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-fg-primary">
          You&rsquo;re on Team
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Your Blackglass Team subscription is active. Head back to the console to
          connect your hosts and start scanning.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="block w-full rounded-card bg-accent-blue py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            Go to console
          </Link>
          <Link
            href="/hosts"
            className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            Add your first host
          </Link>
        </div>
      </div>
    </main>
  );
}
