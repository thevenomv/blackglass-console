"use client";

import Link from "next/link";
import { useState } from "react";

const clerkOn =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  const signIn = clerkOn ? "/sign-in" : "/login";
  const signUp = clerkOn ? "/sign-up" : "/login";

  const links = [
    { href: "/", label: "Home" },
    { href: "/product", label: "Product" },
    { href: "/use-cases", label: "Use Cases" },
    { href: "/pricing", label: "Pricing" },
    { href: "/security", label: "Security" },
    { href: "/demo", label: "Demo" },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b border-border-default/80 bg-bg-base/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg-base/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-fg-primary">
          BLACKGLASS
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-fg-muted transition-colors hover:text-fg-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={signIn}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            Sign in
          </Link>
          <Link
            href={signUp}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Start free trial
          </Link>
        </div>
        <button
          type="button"
          className="rounded-md border border-border-default px-3 py-1.5 text-sm md:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
      </div>
      {open ? (
        <div className="border-t border-border-default bg-bg-panel px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="py-2 text-sm text-fg-muted"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link href={signIn} className="py-2 text-sm" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href={signUp} className="py-2 text-sm font-medium text-accent-blue" onClick={() => setOpen(false)}>
              Start free trial
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
