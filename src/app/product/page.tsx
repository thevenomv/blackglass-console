import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

export const metadata: Metadata = {
  title: "Product — BLACKGLASS",
  description:
    "Baseline capture, drift detection, evidence exports, and fleet posture — how BLACKGLASS fits your Linux integrity program.",
};

const clerkOn =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
const signIn = clerkOn ? "/sign-in" : "/login";

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-bg-base text-fg-muted">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Product
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          Integrity monitoring without scraping secrets off the host
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          BLACKGLASS standardizes how you capture approved SSH and listener baselines, run drift
          scans on demand, and export auditor-ready evidence — with Clerk organizations for workspace
          isolation and Stripe-backed plans when you move from trial to production.
        </p>
        <ul className="mt-8 list-disc space-y-2 pl-5 text-sm">
          <li>Push-ingest agents for hosts that cannot be pulled over SSH from the internet.</li>
          <li>Role-based access including read-only guest auditors for external review.</li>
          <li>Hosted webhook idempotency for Stripe and Clerk at scale-out.</li>
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Explore demo
          </Link>
          <TrialSignupLink className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated">
            Start free trial
          </TrialSignupLink>
          <Link
            href={signIn}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            Sign in
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
