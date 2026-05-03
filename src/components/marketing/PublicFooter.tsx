import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-border-default bg-bg-panel py-12 text-sm text-fg-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
            BLACKGLASS
          </p>
          <p className="mt-2 max-w-sm">
            Linux integrity monitoring — SSH posture, baselines, drift, and audit-ready exports.
          </p>
        </div>
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">Use cases</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link href="/use-cases/linux-configuration-drift-detection" className="hover:text-fg-primary">Configuration drift</Link></li>
            <li><Link href="/use-cases/ssh-configuration-audit" className="hover:text-fg-primary">SSH audit</Link></li>
            <li><Link href="/use-cases/linux-hardening-monitoring" className="hover:text-fg-primary">Hardening monitoring</Link></li>
            <li><Link href="/use-cases/cis-benchmark-monitoring" className="hover:text-fg-primary">CIS benchmarks</Link></li>
            <li><Link href="/guides/how-to-detect-unauthorized-linux-config-changes" className="hover:text-fg-primary">Guide: detect config changes</Link></li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 self-start">
          <Link href="/product" className="hover:text-fg-primary">Product</Link>
          <Link href="/pricing" className="hover:text-fg-primary">Pricing</Link>
          <Link href="/security" className="hover:text-fg-primary">Security</Link>
          <Link href="/demo" className="hover:text-fg-primary">Demo</Link>
          <Link href="/terms" className="hover:text-fg-primary">Terms</Link>
          <Link href="/privacy" className="hover:text-fg-primary">Privacy</Link>
          <Link href="/dpa" className="hover:text-fg-primary">Data processing</Link>
          <Link href="/dashboard" className="hover:text-fg-primary">Console</Link>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-fg-faint">
        © {new Date().getFullYear()} Obsidian Dynamics Limited
      </p>
    </footer>
  );
}
