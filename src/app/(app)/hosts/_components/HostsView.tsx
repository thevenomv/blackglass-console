"use client";

/* eslint-disable react-hooks/incompatible-library -- TanStack Virtual's useVirtualizer is intentionally skipped by the React Compiler */
import type { HostRecord } from "@/data/mock/types";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunScanButton } from "@/app/(app)/dashboard/_components/RunScanButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { HostTrustPill } from "@/components/ui/HostTrustPill";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";

type Filter = "all" | "aligned" | "drift" | "needs_review";

/** Below this count, render rows directly so SSR/hydration always shows data (virtualizer needs a mounted scroll parent). */
const VIRTUAL_THRESHOLD = 48;

function formatScan(iso: string) {
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

export function HostsView({
  hosts,
  atCap = false,
  hostCap = null,
}: {
  hosts: HostRecord[];
  atCap?: boolean;
  hostCap?: number | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hosts.filter((h) => {
      const matchesQuery =
        q.length === 0 ||
        h.id.toLowerCase().includes(q) ||
        h.hostname.toLowerCase().includes(q) ||
        h.os.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "aligned"
            ? h.trust === "aligned"
            : filter === "drift"
              ? h.trust === "drift"
              : h.trust === "needs_review" || h.trust === "critical";
      return matchesQuery && matchesFilter;
    });
  }, [hosts, query, filter]);

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? filtered.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    enabled: useVirtual,
  });

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All hosts" },
    { id: "aligned", label: "Healthy" },
    { id: "drift", label: "Drifted" },
    { id: "needs_review", label: "Needs review" },
  ];

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-6">
      <PageHeader
        title="Hosts"
        subtitle="Inventory, readiness, and entry points into integrity review."
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/hosts", label: "Hosts" },
        ]}
        actions={<RunScanButton />}
      />

      {atCap && hostCap !== null && (
        <UpgradePrompt
          feature={`Host cap reached (${hostCap} hosts on free plan)`}
          description="Upgrade to BLACKGLASS Team to monitor up to 50 hosts, or Fleet for unlimited."
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="block max-w-md flex-1 text-xs text-fg-faint">
          Search hosts
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="hostname, id, or OS"
            className="mt-1 w-full rounded-card border border-border-default bg-bg-panel px-3 py-2 font-mono text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Host filters">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === c.id
                  ? "border-accent-blue bg-accent-blue-soft text-accent-blue"
                  : "border-border-default text-fg-muted hover:border-border-subtle hover:text-fg-primary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No hosts match this view"
          description="Adjust search or filters, or run a scan once collectors are connected."
          action={<RunScanButton />}
        />
      ) : (
        <div
          role="grid"
          aria-label="Hosts inventory"
          aria-rowcount={filtered.length}
          className="overflow-hidden rounded-card border border-border-default bg-bg-panel"
        >
          <div role="row" className="flex border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-fg-faint">
            <div role="columnheader" className="min-w-0 flex-[1.4] font-medium">Host</div>
            <div role="columnheader" className="w-36 font-medium">Posture</div>
            <div role="columnheader" className="w-20 text-right font-medium">Ready</div>
            <div role="columnheader" className="min-w-0 flex-1 px-4 font-medium">Last scan</div>
            <div role="columnheader" className="w-16 text-right font-medium"><span className="sr-only">Actions</span></div>
          </div>
          <div
            ref={parentRef}
            className="max-h-[min(520px,70vh)] overflow-auto"
            style={useVirtual ? { contain: "strict" } : undefined}
          >
            {useVirtual ? (
              <div
                className="relative w-full"
                style={{ height: rowVirtualizer.getTotalSize() }}
              >
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const h = filtered[vi.index];
                  return (
                    <div
                      key={h.id}
                      className="absolute left-0 top-0 flex w-full items-center border-b border-border-subtle px-4 py-3 text-sm hover:bg-bg-elevated"
                      style={{
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <div className="min-w-0 flex-[1.4]">
                        <p className="font-mono text-fg-primary">{h.id}</p>
                        <p className="truncate text-xs text-fg-faint">{h.os}</p>
                      </div>
                      <div className="w-36">
                        <HostTrustPill trust={h.trust} />
                      </div>
                      <div className="w-20 tabular-nums text-right text-fg-muted">
                        {h.readinessScore}%
                      </div>
                      <div className="min-w-0 flex-1 px-4 text-fg-muted">
                        {formatScan(h.lastScanAt)} UTC
                      </div>
                      <div className="w-16 text-right">
                        <Link
                          href={`/hosts/${h.id}`}
                          className="text-xs font-semibold text-accent-blue hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              filtered.map((h) => (
                <div
                  key={h.id}
                  className="flex w-full items-center border-b border-border-subtle px-4 py-3 text-sm hover:bg-bg-elevated"
                >
                  <div className="min-w-0 flex-[1.4]">
                    <p className="font-mono text-fg-primary">{h.id}</p>
                    <p className="truncate text-xs text-fg-faint">{h.os}</p>
                  </div>
                  <div className="w-36">
                    <HostTrustPill trust={h.trust} />
                  </div>
                  <div className="w-20 tabular-nums text-right text-fg-muted">
                    {h.readinessScore}%
                  </div>
                  <div className="min-w-0 flex-1 px-4 text-fg-muted">
                    {formatScan(h.lastScanAt)} UTC
                  </div>
                  <div className="w-16 text-right">
                    <Link
                      href={`/hosts/${h.id}`}
                      className="text-xs font-semibold text-accent-blue hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
