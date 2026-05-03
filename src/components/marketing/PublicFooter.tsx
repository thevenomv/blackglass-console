import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-border-default bg-bg-panel py-12 text-sm text-fg-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
            BLACKGLASS
          </p>
          <p className="mt-2 max-w-sm">
            Linux integrity monitoring — SSH posture, baselines, drift, and audit-ready exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/terms" className="hover:text-fg-primary">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-fg-primary">
            Privacy
          </Link>
          <Link href="/dpa" className="hover:text-fg-primary">
            Data processing
          </Link>
          <Link href="/pricing" className="hover:text-fg-primary">
            Pricing
          </Link>
          <Link href="/dashboard" className="hover:text-fg-primary">
            Console
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-fg-faint">
        © {new Date().getFullYear()} Obsidian Dynamics Limited
      </p>
    </footer>
  );
}
