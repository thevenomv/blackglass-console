import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog | BLACKGLASS",
  description: "Notable product and console updates for BLACKGLASS.",
  openGraph: {
    title: "Changelog | BLACKGLASS",
    description: "Notable product and console updates for BLACKGLASS.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const ENTRIES = [
  {
    date: "2026-05",
    title: "Console polish & trust content",
    items: [
      "Clerk surfaces follow light/dark theme tokens.",
      "PWA manifest icons, reduced-motion-friendly CSS, and drift/evidence table striping.",
      "Playwright E2E defaults to mock auth (set PLAYWRIGHT_CLERK=1 only when testing Clerk locally).",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-14 text-sm leading-relaxed text-fg-muted">
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
        Product
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-fg-primary">Changelog</h1>
      <p className="mt-4">
        Summaries of user-visible changes. For deployment and migration notes, see internal runbooks and{" "}
        <Link href="/security" className="text-accent-blue hover:underline">
          security overview
        </Link>
        .
      </p>

      <ul className="mt-10 space-y-10">
        {ENTRIES.map((e) => (
          <li key={e.date}>
            <p className="font-mono text-xs font-semibold text-fg-faint">{e.date}</p>
            <h2 className="mt-1 text-base font-semibold text-fg-primary">{e.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {e.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-12">
        <Link href="/" className="text-accent-blue hover:underline">
          ← Home
        </Link>
        {" · "}
        <Link href="/product" className="text-accent-blue hover:underline">
          Product overview
        </Link>
      </p>
    </main>
  );
}
