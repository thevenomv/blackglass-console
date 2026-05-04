export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { BaselinesToolbar } from "@/components/baselines/BaselinesToolbar";
import { DiffBlock } from "@/components/ui/DiffBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBaselineDiff, getBaselineSnapshots } from "@/data/mock/baselines";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import { configuredCollectorHostIds } from "@/lib/server/collector-env";
import { getBaseline } from "@/lib/server/baseline-store";
import { getDriftEvents } from "@/lib/server/drift-engine";
import type { BaselineDiffCategory, BaselineDiffRow, BaselineSnapshotMeta, DriftEvent } from "@/data/mock/types";
import Link from "next/link";
import { Suspense } from "react";

function driftEventsToCategories(events: DriftEvent[]): BaselineDiffCategory[] {
  const buckets: Record<string, { label: string; rows: BaselineDiffRow[] }> = {};
  const labels: Record<string, string> = {
    network_exposure: "Network exposure",
    identity: "Identity / privilege",
    firewall: "Firewall",
    services: "Services",
    configuration: "Configuration",
    ssh: "SSH configuration",
  };
  for (const event of events) {
    const catId = event.category ?? "other";
    if (!buckets[catId]) buckets[catId] = { label: labels[catId] ?? catId, rows: [] };
    let evidence: Record<string, unknown> = {};
    try { evidence = JSON.parse(event.evidenceSummary ?? "{}") as Record<string, unknown>; } catch { /* ignore */ }
    buckets[catId].rows.push({
      path: event.title,
      change: "added",
      severity: event.severity as BaselineDiffRow["severity"],
      summary: event.rationale,
      ruleId: typeof evidence["ruleId"] === "string" ? evidence["ruleId"] : undefined,
    });
  }
  return Object.entries(buckets)
    .filter(([, v]) => v.rows.length > 0)
    .map(([id, v]) => ({ id, label: v.label, rows: v.rows }));
}

async function BaselineComparisonContent({ hostId, live }: { hostId: string; live: boolean }) {
  if (!live) await mockLatency(260);

  const grouped: BaselineDiffCategory[] = live
    ? driftEventsToCategories(getDriftEvents(hostId))
    : getBaselineDiff(hostId);

  if (grouped.length === 0) {
    return (
      <EmptyState
        title="No baseline diff cached"
        description="Run a scan and pin a baseline, then compare live state to that snapshot."
        action={<RunScanButton />}
      />
    );
  }

  const changeCount = grouped.reduce((n, g) => n + g.rows.length, 0);
  const highRisk = grouped.flatMap((g) => g.rows).filter((r) => r.severity === "high").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-fg-faint">
        <span className="rounded-full border border-border-default px-2 py-0.5 font-mono text-[11px] text-fg-muted">
          {changeCount} structural changes
        </span>
        {highRisk > 0 ? (
          <span className="rounded-full border border-danger/40 bg-danger-soft/40 px-2 py-0.5 text-danger">
            {highRisk} high severity
          </span>
        ) : null}
      </div>

      <div className="space-y-8">
        {grouped.map((cat) => (
          <section key={cat.id}>
            <h2 className="text-sm font-semibold text-fg-primary">{cat.label}</h2>
            <div className="mt-3 space-y-3">
              {cat.rows.map((row) => (
                <DiffBlock
                  key={`${cat.id}-${row.path}-${row.change}`}
                  path={row.path}
                  change={row.change}
                  severity={row.severity}
                  summary={row.summary}
                  before={row.before}
                  after={row.after}
                  ruleId={row.ruleId}
                  beforeSha256={row.beforeSha256}
                  afterSha256={row.afterSha256}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function BaselineFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function formatPinned(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function BaselinesPage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}) {
  const { host } = await searchParams;
  const live = collectorConfigured();
  const liveHostIds = live ? configuredCollectorHostIds() : [];
  const hostId = host ?? (liveHostIds[0] ?? "host-07");

  let snapshots: BaselineSnapshotMeta[];
  if (live) {
    const stored = await getBaseline(hostId);
    snapshots = stored
      ? [
          {
            id: `bl-${hostId}-active`,
            label: `baseline-${stored.collectedAt.slice(0, 10)}`,
            hostId,
            pinnedAt: stored.collectedAt,
            scanId: "live",
            superseded: false,
          },
        ]
      : [];
  } else {
    snapshots = getBaselineSnapshots(hostId);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
        <PageHeader
          title="Baseline comparison"
          subtitle={`Trusted snapshot versus latest integrity read · ${hostId}`}
          breadcrumbs={[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/baselines", label: "Baselines" },
          ]}
          actions={<BaselinesToolbar />}
        />

        <p className="text-xs text-fg-faint">
          Switch context from{" "}
          <Link href="/hosts" className="text-accent-blue hover:underline">
            host detail
          </Link>{" "}
          — diff payloads mirror <span className="font-mono">GET /hosts/:id/diff</span>.
        </p>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="h-fit rounded-card border border-border-default bg-bg-panel p-4 lg:sticky lg:top-24">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
              Baseline history
            </h3>
            <ul className="mt-3 space-y-2">
              {snapshots.length === 0 ? (
                <li className="text-sm text-fg-muted">No snapshots pinned for this host.</li>
              ) : (
                snapshots.map((s) => (
                  <li
                    key={s.id}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      s.superseded
                        ? "border-border-subtle text-fg-muted"
                        : "border-accent-blue/35 bg-accent-blue-soft/25 text-fg-primary"
                    }`}
                  >
                    <p className="font-mono text-[13px]">{s.label}</p>
                    <p className="mt-1 text-xs text-fg-faint">
                      {formatPinned(s.pinnedAt)} UTC · scan{" "}
                      <span className="font-mono">{s.scanId}</span>
                    </p>
                    {s.superseded ? (
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-fg-faint">
                        Superseded
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-success">
                        Active baseline
                      </p>
                    )}
                  </li>
                ))
              )}
            </ul>
          </aside>

          <div className="min-w-0">
            <Suspense fallback={<BaselineFallback />}>
              <BaselineComparisonContent hostId={hostId} live={live} />
            </Suspense>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
