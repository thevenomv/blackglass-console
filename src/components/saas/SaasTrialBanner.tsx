"use client";

import { useCallback, useEffect, useState } from "react";

type Ctx = {
  trialReadOnly: boolean;
  planCode: string;
  status: string;
  trialEndsAt: string | null;
  hostLimit: number;
  paidSeatLimit: number;
  seatUsage: { paidSeatsUsed: number; paidSeatLimit: number; unlimitedViewers: boolean };
};

/**
 * Trial-state banner. Three escalating states based on
 * `trialEndsAt - now`:
 *
 *   1. Pre-expiry warning  (≤ 7 days, > 0): amber banner with day count + upgrade CTA.
 *      Becomes visually louder when ≤ 2 days remain.
 *   2. Trial ended         (read-only mode): the existing red banner blocking writes.
 *   3. (anything else):    no banner.
 *
 * Why a per-day refresh: trialEndsAt is fixed, but we want the
 * day-count to update without requiring a full page reload. The
 * banner re-computes the number of days remaining on every render,
 * and we re-render every time the user navigates / revisits the
 * `/api/saas/context` endpoint that powers the AppShell.
 *
 * Why no dismiss button: the whole point is to drive conversion.
 * Letting users dismiss the banner forever defeats the purpose; if
 * they upgrade, the banner disappears automatically.
 */

/**
 * Show the pre-expiry banner once the trial has 7 days or fewer
 * remaining. Earlier than that and the prompt feels premature; later
 * than that and we've missed the window where conversion lift is
 * highest. Tunable via NEXT_PUBLIC_TRIAL_WARN_DAYS for operators
 * running shorter or longer trials.
 */
const TRIAL_WARN_DAYS = (() => {
  const raw = process.env.NEXT_PUBLIC_TRIAL_WARN_DAYS;
  if (!raw) return 7;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 30 ? n : 7;
})();

function daysUntil(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  const ms = t - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function SaasTrialBanner() {
  const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const load = useCallback(async () => {
    if (!clerkPk) return;
    const res = await fetch("/api/saas/context", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { trialReadOnly?: boolean; clerk?: boolean } & Partial<Ctx>;
    if (!data.clerk || data.trialReadOnly === undefined) return;
    setCtx({
      trialReadOnly: !!data.trialReadOnly,
      planCode: String(data.planCode ?? ""),
      status: String(data.status ?? ""),
      trialEndsAt: data.trialEndsAt ?? null,
      hostLimit: Number(data.hostLimit ?? 0),
      paidSeatLimit: Number(data.paidSeatLimit ?? 0),
      seatUsage: data.seatUsage ?? {
        paidSeatsUsed: 0,
        paidSeatLimit: 0,
        unlimitedViewers: true,
      },
    });
  }, [clerkPk]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  if (!clerkPk || !ctx) return null;

  // Post-expiry — the existing read-only state. Highest urgency.
  if (ctx.trialReadOnly) {
    return (
      <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">
        <strong className="text-rose-100">Trial ended — read-only mode.</strong> Your workspace is
        preserved and you can keep viewing dashboards and exports allowed by policy. Operational
        actions (scans, host changes, baselines, secrets) stay locked until you upgrade.{" "}
        <a
          href="/pricing"
          className="ml-2 inline-flex h-8 items-center rounded-card border border-rose-300/40 bg-rose-500/20 px-3 text-xs font-medium text-rose-50 hover:bg-rose-500/30"
        >
          Upgrade now
        </a>
        <a
          href="/settings/billing"
          className="ml-2 inline-flex h-8 items-center rounded-card border border-border-default bg-transparent px-3 text-xs font-medium text-fg-primary hover:bg-bg-elevated"
        >
          View billing
        </a>
      </div>
    );
  }

  // Pre-expiry warning — only shows when trialing AND inside the warn
  // window. We deliberately don't show ANY banner during the rest of
  // the trial so it doesn't become wallpaper.
  if (ctx.status !== "trialing" || !ctx.trialEndsAt) return null;
  const days = daysUntil(ctx.trialEndsAt);
  if (days > TRIAL_WARN_DAYS || days < 0) return null;

  const urgent = days <= 2;
  const wrapper = urgent
    ? "border-b border-amber-400/40 bg-amber-500/15 text-amber-100"
    : "border-b border-amber-500/25 bg-amber-500/8 text-amber-200";
  const headline =
    days === 0
      ? "Trial ends today."
      : days === 1
        ? "Trial ends tomorrow."
        : `Trial ends in ${days} days.`;

  return (
    <div className={`${wrapper} px-4 py-3 text-center text-sm`}>
      <strong className="text-amber-50">{headline}</strong>{" "}
      Add billing to keep baselines, drift history, evidence bundles, and team access without
      interruption — your data stays even after the trial ends, but new scans and writes pause.
      <a
        href="/pricing"
        className="ml-3 inline-flex h-8 items-center rounded-card border border-amber-300/40 bg-amber-500/20 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-500/30"
      >
        Upgrade now
      </a>
      <a
        href="/settings/billing"
        className="ml-2 inline-flex h-8 items-center rounded-card border border-border-default bg-transparent px-3 text-xs font-medium text-fg-primary hover:bg-bg-elevated"
      >
        View billing
      </a>
    </div>
  );
}
