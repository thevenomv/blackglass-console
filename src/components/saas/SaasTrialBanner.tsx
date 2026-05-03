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

  if (!clerkPk || !ctx?.trialReadOnly) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
      <strong className="text-amber-100">Trial ended — read-only mode.</strong> Your workspace is
      preserved and you can keep viewing dashboards and exports allowed by policy. Operational
      actions (scans, host changes, baselines, secrets) stay locked until you upgrade.{" "}
      <a
        href="/settings/billing"
        className="ml-2 inline-flex h-8 items-center rounded-card border border-border-default bg-transparent px-3 text-xs font-medium text-fg-primary hover:bg-bg-elevated"
      >
        View billing
      </a>
    </div>
  );
}
