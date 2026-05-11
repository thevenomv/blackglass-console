import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

// Computed once at module load (server start) so SSR and client hydration
// never see different values across a year-boundary deploy. Worst case:
// the copyright shows last year's number for a few hours after Jan 1
// until the server is redeployed — which is fine, and a lot quieter than
// the hydration warning React emits when `new Date()` is evaluated per
// render.
const COPYRIGHT_YEAR = new Date().getFullYear();

export function PublicFooter() {
  return (
    <footer className="border-t border-border-default bg-bg-panel py-12 text-sm text-fg-muted">
      <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <Link href="/" className="inline-flex max-w-full text-fg-primary">
            <BrandLogo variant="footer" />
          </Link>
          <p className="mt-3 max-w-sm">
            Friendly visibility into Linux configuration changes — with snapshots you trust, alerts that
            make sense, and reports you can share.
          </p>
          <p className="mt-4 flex items-center gap-2 text-xs text-fg-faint">
            <Link href="/status" className="inline-flex items-center gap-1.5 hover:text-fg-primary">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              All systems operational
            </Link>
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">Use cases</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link href="/use-cases/linux-configuration-drift-detection" className="hover:text-fg-primary">Configuration drift</Link></li>
            <li><Link href="/use-cases/ssh-configuration-audit" className="hover:text-fg-primary">SSH audit</Link></li>
            <li><Link href="/use-cases/linux-hardening-monitoring" className="hover:text-fg-primary">Hardening monitoring</Link></li>
            <li><Link href="/use-cases/cis-benchmark-monitoring" className="hover:text-fg-primary">CIS benchmarks</Link></li>
            <li><Link href="/use-cases/file-integrity-monitoring" className="hover:text-fg-primary">File integrity (FIM)</Link></li>
            <li><Link href="/use-cases/sox-evidence-capture" className="hover:text-fg-primary">SOX evidence capture</Link></li>
            <li><Link href="/use-cases/incident-response-baselines" className="hover:text-fg-primary">IR baselines</Link></li>
            <li><Link href="/guides/how-to-detect-unauthorized-linux-config-changes" className="hover:text-fg-primary">Guide: detect config changes</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">Platform</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link href="/product" className="hover:text-fg-primary">Product</Link></li>
            <li><Link href="/pricing" className="hover:text-fg-primary">Pricing</Link></li>
            <li><Link href="/demo" className="hover:text-fg-primary">Demo</Link></li>
            <li><Link href="/contact-sales" className="hover:text-fg-primary">Contact sales</Link></li>
            <li><Link href="/book" className="hover:text-fg-primary">Book walkthrough</Link></li>
            <li><Link href="/security" className="hover:text-fg-primary">Security</Link></li>
            <li><Link href="/dashboard" className="hover:text-fg-primary">Console</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">Compare</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link href="/vs" className="hover:text-fg-primary">All comparisons</Link></li>
            <li><Link href="/vs/wiz" className="hover:text-fg-primary">vs Wiz</Link></li>
            <li><Link href="/vs/lacework" className="hover:text-fg-primary">vs Lacework</Link></li>
            <li><Link href="/vs/orca" className="hover:text-fg-primary">vs Orca Security</Link></li>
            <li><Link href="/vs/tenable" className="hover:text-fg-primary">vs Tenable</Link></li>
            <li><Link href="/vs/qualys" className="hover:text-fg-primary">vs Qualys</Link></li>
          </ul>
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">Resources</p>
          <ul className="mt-2 space-y-1.5 lg:columns-2 lg:gap-x-8 lg:space-y-0 [&>li]:lg:break-inside-avoid [&>li]:lg:pb-1.5">
            <li><Link href="/glossary" className="hover:text-fg-primary">Glossary</Link></li>
            <li><Link href="/blog" className="hover:text-fg-primary">Blog</Link></li>
            <li><Link href="/changelog" className="hover:text-fg-primary">Changelog</Link></li>
            <li>
              <Link href="/changelog/feed.xml" className="hover:text-fg-primary">RSS feed</Link>
            </li>
            <li><Link href="/docs/snapshot-freshness" className="hover:text-fg-primary">Snapshot freshness</Link></li>
            <li><Link href="/docs/api" className="hover:text-fg-primary">API docs &amp; examples</Link></li>
            <li><Link href="/tools" className="hover:text-fg-primary">Free tools</Link></li>
            <li><Link href="/tools/cloud-waste-estimator" className="hover:text-fg-primary">Cloud waste estimator</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-border-subtle px-4 pt-8">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-muted">
          <Link href="/privacy" className="hover:text-fg-primary">Legal &amp; privacy</Link>
          <Link href="/terms" className="hover:text-fg-primary">Terms</Link>
          <Link href="/dpa" className="hover:text-fg-primary">Data processing (DPA)</Link>
          <Link href="/subprocessors" className="hover:text-fg-primary">Subprocessors</Link>
        </nav>
        <div className="mt-6 space-y-1 text-xs leading-relaxed text-fg-faint">
          <p>
            © {COPYRIGHT_YEAR} Obsidian Dynamics Limited (Co. No. 16663833). UK ICO registration{" "}
            <span className="whitespace-nowrap">ZC141175</span>.
          </p>
          <p>
            Registered office: Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset BH16 6FA.
          </p>
        </div>
      </div>
    </footer>
  );
}
