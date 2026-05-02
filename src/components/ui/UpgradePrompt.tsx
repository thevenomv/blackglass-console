"use client";

import Link from "next/link";

export function UpgradePrompt({
  feature,
  description,
  compact = false,
}: {
  feature: string;
  description?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-blue/40 bg-accent-blue/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-blue">
        Pro
        <Link href="/pricing" className="underline underline-offset-2 hover:opacity-80">
          Upgrade
        </Link>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-default bg-bg-elevated px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-accent-blue/40 bg-accent-blue/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-accent-blue">
          Pro
        </span>
        <p className="text-sm font-medium text-fg-primary">{feature}</p>
      </div>
      {description && <p className="text-xs text-fg-muted">{description}</p>}
      <Link
        href="/pricing"
        className="w-fit text-xs font-medium text-accent-blue hover:underline"
      >
        See pricing →
      </Link>
    </div>
  );
}
