"use client";

import type { FleetSnapshot, HostRecord, HostTrust } from "@/data/mock/types";
import type { LiveDashboardDriftCategory } from "@/lib/dashboard-shared";
import type { Tone } from "@/components/ui/Badge";
import { Badge } from "@/components/ui/Badge";
import { CaptureBaselineButton } from "@/app/(app)/baselines/_components/CaptureBaselineButton";
import { RunScanButton } from "./RunScanButton";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { ComplianceScoreTile } from "./ComplianceScoreTile";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressRow } from "@/components/ui/ProgressBar";
import { SecurityOverviewSection } from "./SecurityOverviewSection";
import { ValueRecapBanner, type ValueRecap } from "@/components/dashboard/ValueRecapBanner";
import { DriftTrendChart } from "@/components/dashboard/DriftTrendChart";
import {
  SystemStatusBanner,
  type SystemStatusItem,
} from "@/components/dashboard/SystemStatusBanner";
import { formatAbsoluteUtc, formatRelativeTime } from "@/lib/format-time";
import Link from "next/link";
import { useState } from "react";

type TimeRange = "24h" | "7d" | "30d";

/** Mock period-over-period deltas keyed by time range. */
const KPI_DELTAS: Record<
  TimeRange,
  {
    hostsChecked: { label: string; positive: boolean };
    highRiskDrift: { label: string; positive: boolean };
    readyHosts: { label: string; positive: boolean };
    evidenceBundles: { label: string; positive: boolean };
  }
> = {
  "24h": {
    hostsChecked: { label: "+2 from yesterday", positive: true },
    highRiskDrift: { label: "+1 from yesterday", positive: false },
    readyHosts: { label: "−1 from yesterday", positive: false },
    evidenceBundles: { label: "same as yesterday", positive: true },
  },
  "7d": {
    hostsChecked: { label: "+3 from last week", positive: true },
    highRiskDrift: { label: "−2 from last week", positive: true },
    readyHosts: { label: "+2 from last week", positive: true },
    evidenceBundles: { label: "+4 from last week", positive: true },
  },
  "30d": {
    hostsChecked: { label: "+6 from last month", positive: true },
    highRiskDrift: { label: "+1 from last month", positive: false },
    readyHosts: { label: "+4 from last month", positive: true },
    evidenceBundles: { label: "+12 from last month", positive: true },
  },
};

function trustTone(trust: HostTrust): Tone {
  if (trust === "critical" || trust === "drift") return "danger";
  if (trust === "needs_review") return "warning";
  return "success";
}

function trustLabel(trust: HostTrust): string {
  const map: Record<HostTrust, string> = {
    critical: "Critical",
    drift: "Changed",
    needs_review: "Needs review",
    aligned: "Aligned",
  };
  return map[trust];
}

export function DashboardV3({
  fleet,
  showDemoKpiDeltas,
  collectorConfigured: collectorOn,
  driftTopCategories,
  spotlightHost,
  ctaHostId,
  baselinePersistence,
  valueRecap,
  onboardingState,
}: {
  fleet: FleetSnapshot;
  showDemoKpiDeltas: boolean;
  collectorConfigured: boolean;
  driftTopCategories: LiveDashboardDriftCategory[];
  spotlightHost: HostRecord | null;
  ctaHostId: string | null;
  baselinePersistence: { configured: boolean; path?: string; writable: boolean | null };
  valueRecap: ValueRecap;
  onboardingState?: {
    hostConnected: boolean;
    baselineCaptured: boolean;
    scanRun: boolean;
  };
}) {
  const liveMode = !showDemoKpiDeltas;
  const attention = fleet.highRiskDrift > 0;
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const deltas = KPI_DELTAS[timeRange];
  const d = showDemoKpiDeltas ? deltas : null;

  const driftCategories = liveMode ? driftTopCategories : [];

  // Roll the previously-stacked banner zoo into a single SystemStatusBanner.
  // Each entry below is conditionally added in priority order (most urgent
  // first); `SystemStatusBanner` then re-sorts by severity so the worst
  // issue leads visually regardless of evaluation order. The "all good"
  // success banner is rendered separately further down only when this list
  // is empty AND there are no urgent findings.
  const systemStatusItems: SystemStatusItem[] = [];
  if (liveMode) {
    if (
      collectorOn &&
      baselinePersistence.configured &&
      baselinePersistence.writable === false
    ) {
      systemStatusItems.push({
        id: "baseline-not-writable",
        severity: "danger",
        title: "Baseline store path is not writable",
        detail: (
          <>
            Check permissions on{" "}
            <span className="font-mono text-fg-primary">{baselinePersistence.path}</span> (and its
            parent directory).
          </>
        ),
      });
    }
    if (attention) {
      systemStatusItems.push({
        id: "urgent-findings",
        severity: "danger",
        title: `${fleet.highRiskDrift} urgent finding${fleet.highRiskDrift === 1 ? "" : "s"} need review`,
        detail: (
          <>
            Review before shipping new snapshots —{" "}
            <Link href="/drift" className="font-medium text-accent-blue hover:underline">
              open findings
            </Link>
            .
          </>
        ),
      });
    }
    if (!collectorOn) {
      systemStatusItems.push({
        id: "no-collector",
        severity: "warning",
        title: "No collector connected",
        detail: (
          <>
            Configure a host and credentials to start collecting data —{" "}
            <Link href="/settings" className="font-medium text-accent-blue hover:underline">
              open settings
            </Link>
            .
          </>
        ),
      });
    }
    if (collectorOn && !baselinePersistence.configured) {
      systemStatusItems.push({
        id: "baseline-in-memory",
        severity: "warning",
        title: "Snapshots are in-memory only",
        detail:
          "Point baseline storage at a mounted volume so trusted snapshots survive restarts (Operator settings).",
      });
    }
    if (collectorOn && fleet.hostsChecked === 0) {
      systemStatusItems.push({
        id: "no-hosts",
        severity: "info",
        title: "No hosts under monitoring yet",
        detail: (
          <>
            Capture a trusted snapshot while systems are known-good — use{" "}
            <Link href="/baselines" className="font-medium text-accent-blue hover:underline">
              Baselines
            </Link>{" "}
            or your automation, then run a scan.
          </>
        ),
      });
    }
  }

  let postureTone: Tone = "success";
  let postureLabel = "Healthy";
  if (liveMode) {
    if (fleet.hostsChecked === 0 && collectorOn) {
      postureTone = "neutral";
      postureLabel = "Awaiting baseline";
    } else if (fleet.highRiskDrift > 0) {
      postureTone = "danger";
      postureLabel = "Attention";
    } else if (fleet.hostsChecked > 0 && fleet.readyHosts < fleet.hostsChecked) {
      postureTone = "warning";
      postureLabel = "Partial readiness";
    }
  }

  return (
    <div className="flex flex-col gap-5 px-6 pb-8 pt-6">
      <PageHeader
        title="Fleet"
        actions={
          <>
            {showDemoKpiDeltas ? (
              <div
                role="group"
                aria-label="Time range"
                className="flex rounded-card border border-border-default bg-bg-base"
              >
                {(["24h", "7d", "30d"] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-card last:rounded-r-card ${
                      timeRange === r
                        ? "bg-accent-blue text-white"
                        : "text-fg-muted hover:text-fg-primary"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
            {collectorOn ? <CaptureBaselineButton /> : null}
            <RunScanButton />
          </>
        }
      />

      {liveMode && onboardingState ? (
        <OnboardingChecklist
          hostConnected={onboardingState.hostConnected}
          baselineCaptured={onboardingState.baselineCaptured}
          scanRun={onboardingState.scanRun}
        />
      ) : null}

      <SystemStatusBanner items={systemStatusItems} />

      {liveMode && systemStatusItems.length === 0 ? (
        <div
          role="region"
          aria-label="Fleet drift summary"
          className="rounded-card border border-success/35 bg-success-soft/25 px-4 py-3 text-sm text-fg-muted"
        >
          No urgent findings in the latest sweep — keep an eye on notable hosts below.
        </div>
      ) : null}

      <ValueRecapBanner recap={valueRecap} />

      <ComplianceScoreTile
        hostsChecked={fleet.hostsChecked}
        highRiskDrift={fleet.highRiskDrift}
        readyHosts={fleet.readyHosts}
      />

      <Card title="Findings trend — last 7 days">
        <DriftTrendChart />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Hosts checked"
          value={fleet.hostsChecked}
          sublabel="Telemetry coverage this window"
          delta={d?.hostsChecked}
        />
        <KpiCard
          label="Urgent findings"
          value={fleet.highRiskDrift}
          sublabel="Needs review first"
          tone="risk"
          delta={d?.highRiskDrift}
        />
        <KpiCard
          label="Ready hosts"
          value={fleet.readyHosts}
          sublabel="Baseline aligned posture"
          tone="positive"
          delta={d?.readyHosts}
        />
        <KpiCard
          label="Evidence bundles"
          value={fleet.evidenceBundles}
          sublabel={
            showDemoKpiDeltas ? "Exports retained" : "Stub bundles in Evidence (API catalog)"
          }
          delta={d?.evidenceBundles}
        />
      </div>

      <Card title="Telemetry coverage & freshness">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-border-subtle bg-bg-panel px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Collectors</p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-fg-primary">
              {fleet.coverage.collectorsOnline}
              <span className="text-fg-faint"> / </span>
              {fleet.coverage.collectorsExpected}
              <span className="ml-2 text-xs font-sans font-normal text-fg-muted">online</span>
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-bg-panel px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Fleet heartbeat</p>
            <p
              className="mt-2 text-sm tabular-nums text-fg-primary"
              title={formatAbsoluteUtc(fleet.coverage.lastFleetHeartbeatAt)}
            >
              {formatRelativeTime(fleet.coverage.lastFleetHeartbeatAt)}
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-bg-panel px-4 py-3 sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Stale slices</p>
            {fleet.coverage.staleSlices.length === 0 ? (
              <p className="mt-2 text-sm text-fg-muted">No overdue telemetry slices.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12px] text-fg-primary">
                {fleet.coverage.staleSlices.map((s) => (
                  <li key={`${s.hostId}-${s.slice}`}>
                    <Link href={`/hosts/${s.hostId}`} className="text-accent-blue hover:underline">
                      {s.hostId}
                    </Link>{" "}
                    <span className="text-fg-muted">{s.slice}</span>
                    <span className="text-fg-faint"> · </span>
                    <span className="text-fg-muted" title={formatAbsoluteUtc(s.staleSince)}>
                      {formatRelativeTime(s.staleSince)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Fleet overview"
        action={
          <Badge tone={liveMode ? postureTone : "success"}>
            {liveMode ? postureLabel : "Healthy"}
          </Badge>
        }
      >
        <div className="space-y-4">
          <ul className="space-y-1 text-sm text-fg-muted">
            {fleet.fleetBullets.length === 0 ? (
              <li>No fleet summary lines yet.</li>
            ) : (
              fleet.fleetBullets.map((line) => <li key={line}>{line}</li>)
            )}
          </ul>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Notable items
            </p>
            {fleet.notableEvents.length === 0 ? (
              <p className="mt-2 text-sm text-fg-muted">No open items in the latest window.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-[13px] text-fg-primary">
                {fleet.notableEvents.map((ev) => (
                  <li key={`${ev.hostId}-${ev.slug}`}>
                    <Link
                      className="text-accent-blue hover:underline"
                      href={`/hosts/${ev.hostId}?finding=${ev.slug}`}
                    >
                      {ev.hostId}
                    </Link>{" "}
                    {ev.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Urgent findings"
          action={<Badge tone="danger">Attention required</Badge>}
        >
          {liveMode ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                Top types ({fleet.highRiskDrift > 0 ? "urgent · new" : "new items"})
              </p>
              {driftCategories.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">
                  {fleet.highRiskDrift === 0
                    ? "No urgent items right now."
                    : "No breakdown yet — open the findings list."}{" "}
                  <Link href="/drift" className="font-medium text-accent-blue hover:underline">
                    View findings
                  </Link>
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-fg-primary">
                  {driftCategories.map((row, i) => (
                    <li
                      key={row.category}
                      className={`border-l-2 pl-3 ${i === 0 ? "border-accent-blue" : "border-border-default"}`}
                    >
                      {row.label}
                      <span className="text-fg-muted"> ({row.count})</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                Top classes
              </p>
              <ul className="mt-2 space-y-2 text-sm text-fg-primary">
                <li className="border-l-2 border-accent-blue pl-3">Network exposure</li>
                <li className="border-l-2 border-border-default pl-3">Identity drift</li>
                <li className="border-l-2 border-border-default pl-3">Service persistence</li>
              </ul>
            </>
          )}
        </Card>

        <Card title="Recommended actions" action={<Badge tone="accent">Action plan</Badge>}>
          {liveMode ? (
            <ol className="list-decimal space-y-2 pl-4 text-sm text-fg-muted marker:text-fg-faint">
              <li>
                {ctaHostId ? (
                  <>
                    Review baseline diff for{" "}
                    <Link
                      href={`/baselines?host=${ctaHostId}`}
                      className="font-mono text-accent-blue hover:underline"
                    >
                      {ctaHostId}
                    </Link>
                  </>
                ) : (
                  <>
                    Capture a baseline on the{" "}
                    <Link href="/baselines" className="text-accent-blue hover:underline">
                      Baselines
                    </Link>{" "}
                    page when hosts are in a known-good state
                  </>
                )}
              </li>
              <li>
                <Link href="/drift" className="text-accent-blue hover:underline">
                  Triage new findings
                </Link>
              </li>
              <li>
                <Link href="/evidence" className="text-accent-blue hover:underline">
                  Export an evidence bundle
                </Link>
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-4 text-sm text-fg-muted marker:text-fg-faint">
              <li>
                Review baseline diff for{" "}
                <Link href="/baselines?host=host-07" className="font-mono text-accent-blue hover:underline">
                  host-07
                </Link>
              </li>
              <li>Confirm approved change window</li>
              <li>
                <Link href="/evidence" className="text-accent-blue hover:underline">
                  Export evidence bundle
                </Link>
              </li>
            </ol>
          )}
        </Card>
      </div>

      {showDemoKpiDeltas || spotlightHost ? (
        <Card title="Host spotlight">
          {showDemoKpiDeltas ? (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle pb-4">
                <p className="text-sm text-fg-muted">
                  <span className="font-mono text-fg-primary">host-07</span>
                  <span className="text-fg-faint"> · </span>
                  Ubuntu 22.04
                </p>
                <Link href="/hosts/host-07" className="text-xs font-medium text-accent-blue hover:underline">
                  Open host
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ProgressRow label="Network listeners" value={72} />
                <ProgressRow label="User / group drift" value={88} />
                <ProgressRow label="Systemd persistence" value={34} />
                <ProgressRow label="Evidence completeness" value={61} />
              </div>
            </>
          ) : spotlightHost ? (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle pb-4">
                <p className="text-sm text-fg-muted">
                  <span className="font-mono text-fg-primary">{spotlightHost.id}</span>
                  <span className="text-fg-faint"> · </span>
                  <span className="text-fg-primary">{spotlightHost.hostname}</span>
                  <span className="text-fg-faint"> · </span>
                  {spotlightHost.os}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={trustTone(spotlightHost.trust)}>{trustLabel(spotlightHost.trust)}</Badge>
                  <Link
                    href={`/hosts/${spotlightHost.id}`}
                    className="text-xs font-medium text-accent-blue hover:underline"
                  >
                    Open host
                  </Link>
                </div>
              </div>
              <ProgressRow label="Fleet readiness score" value={spotlightHost.readinessScore} />
            </>
          ) : null}
        </Card>
      ) : null}

      <SecurityOverviewSection />
    </div>
  );
}
