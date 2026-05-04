"use client";

import type { TimelineEntry } from "@/data/mock/types";
import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";
import { useState } from "react";

const DEFAULT_TASKS = [
  "Confirm listener owner + change ticket linkage",
  "Reconcile nftables default policy vs baseline",
  "Attach evidence bundle export to case folder",
];

function formatAt(iso: string) {
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

export function WorkspaceConsole({
  incidentId,
  hostId,
  timeline,
}: {
  incidentId: string;
  hostId: string;
  timeline: TimelineEntry[];
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});

  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Incident workspace"
        subtitle={`${incidentId}${hostId ? ` · scoped host ${hostId}` : ""} — coordination surface for operators.`}
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: `/workspace?incident=${encodeURIComponent(incidentId)}&host=${encodeURIComponent(hostId)}`, label: "Workspace" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-sm font-semibold text-fg-primary">Evidence & links</h2>
          <ul className="space-y-2 text-sm text-fg-muted">
            <li>
              <Link href={`/hosts/${hostId}`} className="font-medium text-accent-blue hover:underline">
                Host detail · {hostId}
              </Link>
            </li>
            <li>
              <Link href={`/drift?host=${hostId}&severity=high`} className="font-medium text-accent-blue hover:underline">
                Drift queue filtered · high severity
              </Link>
            </li>
            <li>
              <Link href={`/baselines?host=${hostId}`} className="font-medium text-accent-blue hover:underline">
                Baseline diff · {hostId}
              </Link>
            </li>

          </ul>
        </section>

        <aside className="h-fit rounded-card border border-border-default bg-bg-panel p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold text-fg-primary">Runbook tasks</h2>
          <ul className="mt-3 space-y-2">
            {DEFAULT_TASKS.map((t, i) => (
              <li key={t} className="flex gap-2 text-sm">
                <input
                  id={`task-${i}`}
                  type="checkbox"
                  checked={Boolean(done[i])}
                  onChange={(ev) =>
                    setDone((prev) => ({
                      ...prev,
                      [i]: ev.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <label htmlFor={`task-${i}`} className="cursor-pointer text-fg-muted">
                  {t}
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="rounded-card border border-border-default bg-bg-panel p-5">
        <h2 className="text-sm font-semibold text-fg-primary">Timeline · {hostId}</h2>
        <ul className="mt-4 space-y-4 border-l-2 border-border-default pl-4">
          {timeline.map((e) => (
            <li key={`${e.at}-${e.label}`} className="text-sm">
              <p className="font-mono text-[12px] text-fg-faint">{formatAt(e.at)} UTC</p>
              <p className="mt-1 font-medium text-fg-primary">{e.label}</p>
              <p className="mt-0.5 text-fg-muted">{e.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
