"use client";

import Link from "next/link";

/**
 * Inline "this needs a higher tier" gate used by feature-locked UI.
 *
 * `tier` is the *minimum* tier the user must be on to unlock the feature
 * (e.g. "Starter", "Growth"). Default is "Upgrade" so older callers that
 * pre-date the tier ladder don't crash; new callers should always pass
 * the actual minimum tier name so the badge matches what's on /pricing.
 */
export function UpgradePrompt({
  feature,
  description,
  compact = false,
  tier = "Upgrade",
}: {
  feature: string;
  description?: string;
  compact?: boolean;
  tier?: string;
}) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-blue/40 bg-accent-blue/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-blue">
        {tier}
        <Link href="/pricing" className="underline underline-offset-2 hover:opacity-80">
          Upgrade
        </Link>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-default bg-bg-elevated px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-accent-blue/40 bg-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-blue">
          {tier}
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
