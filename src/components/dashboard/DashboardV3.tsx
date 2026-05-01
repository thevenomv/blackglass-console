import type { FleetSnapshot } from "@/data/mock/types";
import { Badge } from "@/components/ui/Badge";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { ProgressRow } from "@/components/ui/ProgressBar";
import Link from "next/link";

export function DashboardV3({ fleet }: { fleet: FleetSnapshot }) {
  const attention = fleet.highRiskDrift > 0;

  return (
    <div className="flex flex-col gap-6 px-6 pb-8 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg-primary">
            Fleet dashboard
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Production hosts · drift, integrity and readiness — prioritize attention items first.
          </p>
        </div>
        <RunScanButton />
      </header>

      {attention ? (
        <div
          role="region"
          aria-label="Fleet attention"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft/35 px-4 py-3 text-sm"
        >
          <p className="text-fg-primary">
            <span className="font-semibold text-danger">{fleet.highRiskDrift}</span>{" "}
            high-risk drift signal{fleet.highRiskDrift === 1 ? "" : "s"} require review before new
            baselines ship.
          </p>
          <Link
            href="/drift"
            className="shrink-0 font-medium text-accent-blue hover:underline"
          >
            Open drift queue
          </Link>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Fleet drift summary"
          className="rounded-card border border-success/35 bg-success-soft/25 px-4 py-3 text-sm text-fg-muted"
        >
          No high-risk drift in the latest sweep — continue monitoring notable hosts below.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Hosts checked"
          value={fleet.hostsChecked}
          sublabel="Telemetry coverage this window"
        />
        <KpiCard
          label="High-risk drift"
          value={fleet.highRiskDrift}
          sublabel="Needs operator review"
          tone="risk"
        />
        <KpiCard
          label="Ready hosts"
          value={fleet.readyHosts}
          sublabel="Baseline aligned posture"
          tone="positive"
        />
        <KpiCard
          label="Evidence bundles"
          value={fleet.evidenceBundles}
          sublabel="Exports retained"
        />
      </div>

      <Card title="Fleet overview">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Healthy</Badge>
            </div>
            <ul className="space-y-1 text-sm text-fg-muted">
              {fleet.fleetBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                Notable items
              </p>
              <ul className="mt-2 space-y-2 font-mono text-[13px] text-fg-primary">
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
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-56">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Drift volume (index)
            </p>
            <p id="drift-chart-summary" className="sr-only">
              Bar chart of drift index by day for the last six days. Numeric values are listed in the
              hidden data table below for screen readers.
            </p>
            <div
              className="mt-3 flex h-28 items-end justify-between gap-2"
              role="img"
              aria-labelledby="drift-chart-summary"
            >
              {fleet.driftVolumeByDay.map((b) => (
                <div key={b.day} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full max-w-[28px] rounded-sm bg-accent-blue/25 hover:bg-accent-blue/45"
                    style={{ height: `${b.valuePct}%` }}
                    title={`${b.day}: drift index ${b.valuePct}%`}
                  />
                  <span className="text-[10px] text-fg-faint">{b.day}</span>
                </div>
              ))}
            </div>
            <table className="sr-only">
              <caption>Drift volume index by day</caption>
              <thead>
                <tr>
                  <th scope="col">Day label</th>
                  <th scope="col">Drift index (%)</th>
                </tr>
              </thead>
              <tbody>
                {fleet.driftVolumeByDay.map((b) => (
                  <tr key={b.day}>
                    <td>{b.day}</td>
                    <td>{b.valuePct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="High-risk drift"
          action={<Badge tone="danger">Attention required</Badge>}
        >
          <p className="text-sm text-fg-muted">
            New listeners, privileged-user deltas and persistence entries are the strongest fleet
            signals.
          </p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-fg-faint">
            Top classes
          </p>
          <ul className="mt-2 space-y-2 text-sm text-fg-primary">
            <li className="border-l-2 border-accent-blue pl-3">Network exposure</li>
            <li className="border-l-2 border-border-default pl-3">Identity drift</li>
            <li className="border-l-2 border-border-default pl-3">Service persistence</li>
          </ul>
        </Card>

        <Card title="Recommended actions" action={<Badge tone="accent">Action plan</Badge>}>
          <ol className="list-decimal space-y-2 pl-4 text-sm text-fg-muted marker:text-fg-faint">
            <li>
              Review baseline diff for{" "}
              <Link
                href="/baselines?host=host-07"
                className="font-mono text-accent-blue hover:underline"
              >
                host-07
              </Link>
            </li>
            <li>Confirm approved change window</li>
            <li>
              <Link href="/evidence" className="text-accent-blue hover:underline">
                Export evidence bundle
              </Link>{" "}
              for security review
            </li>
          </ol>
        </Card>
      </div>

      <Card title="Host detail">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle pb-4">
          <p className="text-sm text-fg-muted">
            <span className="font-mono text-fg-primary">host-07</span>
            <span className="text-fg-faint"> · </span>
            Ubuntu 22.04
          </p>
          <Link
            href="/hosts/host-07"
            className="text-xs font-medium text-accent-blue hover:underline"
          >
            Open host
          </Link>
        </div>
        <p className="mb-4 text-xs text-fg-faint">
          Investigation readiness — higher values indicate more divergence from baseline in each
          lane.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <ProgressRow label="Network listeners" value={72} />
          <ProgressRow label="User / group drift" value={88} />
          <ProgressRow label="Systemd persistence" value={34} />
          <ProgressRow label="Evidence completeness" value={61} />
        </div>
      </Card>
    </div>
  );
}
