"use client";

import type { DriftEvent, DriftSeverity, FindingLifecycle } from "@/data/mock/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { DriftInvestigationDrawer } from "@/components/drift/DriftInvestigationDrawer";
import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUAL_THRESHOLD = 48;

const ALL_LIFECYCLES: FindingLifecycle[] = [
  "new",
  "triaged",
  "accepted_risk",
  "remediated",
  "verified",
];

function formatDetected(iso: string) {
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

function lifecycleTone(l: FindingLifecycle): "neutral" | "warning" | "success" | "accent" {
  if (l === "new") return "neutral";
  if (l === "triaged") return "accent";
  if (l === "accepted_risk") return "warning";
  if (l === "remediated" || l === "verified") return "success";
  return "neutral";
}

function lifecycleShort(l: FindingLifecycle) {
  const map: Record<FindingLifecycle, string> = {
    new: "new",
    triaged: "triaged",
    accepted_risk: "risk accepted",
    remediated: "remediated",
    verified: "verified",
  };
  return map[l];
}

function DriftTableRow({
  e,
  selected,
  onSelect,
  onOpen,
}: {
  e: DriftEvent;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      role="row"
      aria-selected={selected}
      className="flex w-full cursor-pointer items-center border-b border-border-subtle px-4 py-3 text-sm hover:bg-bg-elevated"
    >
      <div className="mr-3 shrink-0">
        <input
          type="checkbox"
          aria-label={`Select finding: ${e.title}`}
          checked={selected}
          onChange={(ev) => {
            ev.stopPropagation();
            onSelect(e.id, ev.target.checked);
          }}
          onClick={(ev) => ev.stopPropagation()}
          className="h-4 w-4 cursor-pointer accent-[var(--accent-blue)]"
        />
      </div>
      <div
        tabIndex={0}
        role="button"
        className="flex min-w-0 flex-1 items-center gap-x-0"
        onClick={() => onOpen(e.id)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpen(e.id);
          }
        }}
      >
        <div className="min-w-0 flex-[1.05] text-fg-muted">{formatDetected(e.detectedAt)} UTC</div>
        <div className="w-24 shrink-0 font-mono text-fg-primary">{e.hostId}</div>
        <div className="min-w-0 flex-1 truncate px-2 text-fg-muted">{e.title}</div>
        <div className="w-20 shrink-0">
          <Badge
            tone={
              e.severity === "high"
                ? "danger"
                : e.severity === "medium"
                  ? "warning"
                  : "neutral"
            }
          >
            {e.severity}
          </Badge>
        </div>
        <div className="w-36 shrink-0 pr-2">
          <Badge tone={lifecycleTone(e.lifecycle)}>{lifecycleShort(e.lifecycle)}</Badge>
        </div>
        <div className="w-14 shrink-0 text-right">
          <button
            type="button"
            className="text-xs font-semibold text-accent-blue hover:underline"
            onClick={(ev) => {
              ev.stopPropagation();
              onOpen(e.id);
            }}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

export function DriftEventsView({
  events,
  selected,
}: {
  events: DriftEvent[];
  selected?: DriftEvent;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  const severityQ = searchParams.get("severity") as DriftSeverity | null;
  const lifecycleQ = searchParams.get("lifecycle") as FindingLifecycle | null;
  const hostQ = searchParams.get("host");

  const patchQuery = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/drift?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (severityQ && e.severity !== severityQ) return false;
      if (lifecycleQ && e.lifecycle !== lifecycleQ) return false;
      if (hostQ && e.hostId !== hostQ) return false;
      return true;
    });
  }, [events, severityQ, lifecycleQ, hostQ]);

  const hostIds = useMemo(
    () => [...new Set(events.map((e) => e.hostId))].sort(),
    [events],
  );

  const driftDrawerBack = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("event");
    const q = sp.toString();
    return q ? `/drift?${q}` : "/drift";
  }, [searchParams]);

  const openEvent = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("event", id);
    router.push(`/drift?${sp.toString()}`);
  };

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  }, [selectedIds.size, filtered]);

  const handleBulkTriage = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await fetch("/api/v1/audit/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_triage",
          detail: `Triaged ${selectedIds.size} finding(s): ${[...selectedIds].join(", ")}`,
        }),
      });
      toast(`${selectedIds.size} finding${selectedIds.size === 1 ? "" : "s"} marked as triaged.`, "success");
      setSelectedIds(new Set());
    } catch {
      toast("Bulk triage failed — try again.", "danger");
    } finally {
      setBulkActing(false);
    }
  }, [selectedIds, toast]);

  const handleBulkAcceptRisk = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await fetch("/api/v1/audit/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_accept_risk",
          detail: `Risk accepted for ${selectedIds.size} finding(s): ${[...selectedIds].join(", ")}`,
        }),
      });
      toast(`Risk accepted for ${selectedIds.size} finding${selectedIds.size === 1 ? "" : "s"}.`, "warning");
      setSelectedIds(new Set());
    } catch {
      toast("Bulk action failed — try again.", "danger");
    } finally {
      setBulkActing(false);
    }
  }, [selectedIds, toast]);

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? filtered.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 8,
    enabled: useVirtual,
  });

  return (
    <>
      <div className="flex flex-col gap-6 px-6 pb-10 pt-6">
        <PageHeader
          title="Drift"
          subtitle="High-signal deltas grouped by integrity class — open an event to investigate."
          breadcrumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/drift", label: "Drift" },
          ]}
          actions={<RunScanButton />}
        />

        <nav
          aria-label="Integrity workflow shortcuts"
          className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted"
        >
          <Link href="/baselines" className="font-medium text-accent-blue hover:underline">
            Baselines
          </Link>
          <span aria-hidden className="text-fg-faint">
            →
          </span>
          <span className="font-medium text-fg-primary">Drift triage</span>
          <span aria-hidden className="text-fg-faint">
            →
          </span>
          <Link href="/evidence" className="font-medium text-accent-blue hover:underline">
            Evidence export
          </Link>
        </nav>

        <div
          className="rounded-card border border-border-subtle bg-bg-panel/70 px-4 py-3"
          aria-label="Drift list filters"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              Severity
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(["", "high", "medium", "low"] as const).map((v) => (
                <button
                  key={v || "all"}
                  type="button"
                  onClick={() => patchQuery({ severity: v || null })}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    (severityQ ?? "") === v
                      ? "border-accent-blue bg-accent-blue-soft/35 text-fg-primary"
                      : "border-border-default text-fg-muted hover:bg-bg-elevated"
                  }`}
                >
                  {v === "" ? "All" : v}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              Lifecycle
            </span>
            <div className="flex max-w-full flex-wrap gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => patchQuery({ lifecycle: null })}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  !lifecycleQ
                    ? "border-accent-blue bg-accent-blue-soft/35 text-fg-primary"
                    : "border-border-default text-fg-muted hover:bg-bg-elevated"
                }`}
              >
                All
              </button>
              {ALL_LIFECYCLES.map((lc) => (
                <button
                  key={lc}
                  type="button"
                  onClick={() => patchQuery({ lifecycle: lc })}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    lifecycleQ === lc
                      ? "border-accent-blue bg-accent-blue-soft/35 text-fg-primary"
                      : "border-border-default text-fg-muted hover:bg-bg-elevated"
                  }`}
                >
                  {lifecycleShort(lc)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="font-semibold uppercase tracking-wide text-fg-faint">Host</span>
              <select
                value={hostQ ?? ""}
                onChange={(ev) => patchQuery({ host: ev.target.value || null })}
                className="rounded-md border border-border-default bg-bg-base px-2 py-1.5 font-mono text-[12px] text-fg-primary outline-none ring-accent-blue focus:ring-2"
              >
                <option value="">All hosts</option>
                {hostIds.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-xs font-medium text-accent-blue hover:underline"
              onClick={() =>
                patchQuery({
                  severity: null,
                  lifecycle: null,
                  host: null,
                })
              }
            >
              Clear filters
            </button>
          </div>
        </div>

        <div
          role="grid"
          aria-label="Drift events"
          aria-rowcount={filtered.length}
          className="overflow-hidden rounded-card border border-border-default bg-bg-panel"
        >
          {/* Bulk action toolbar */}
          {selectedIds.size > 0 ? (
            <div
              role="toolbar"
              aria-label="Bulk actions"
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-accent-blue-soft/25 px-4 py-2 text-sm"
            >
              <span className="font-medium text-fg-primary">
                {selectedIds.size} selected
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={bulkActing}
                onClick={() => void handleBulkTriage()}
              >
                Mark triaged
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={bulkActing}
                onClick={() => void handleBulkAcceptRisk()}
              >
                Accept risk
              </Button>
              <button
                type="button"
                className="ml-auto text-xs text-fg-muted hover:text-fg-primary"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </button>
            </div>
          ) : null}
          <div className="flex border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-fg-faint">
            <div className="mr-3 shrink-0">
              <input
                type="checkbox"
                aria-label="Select all findings"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                ref={(el) => {
                  if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 cursor-pointer accent-[var(--accent-blue)]"
              />
            </div>
            <div className="min-w-0 flex-[1.05] font-medium">Detection time</div>
            <div className="w-24 shrink-0 font-medium">Host</div>
            <div className="min-w-0 flex-1 px-2 font-medium">Title</div>
            <div className="w-20 shrink-0 font-medium">Severity</div>
            <div className="w-36 shrink-0 font-medium">Lifecycle</div>
            <div className="w-14 shrink-0 text-right font-medium"> </div>
          </div>
          <div
            ref={parentRef}
            className={useVirtual ? "h-[min(480px,65vh)] overflow-auto" : "max-h-[min(480px,65vh)] overflow-auto"}
            style={useVirtual ? { contain: "strict" } : undefined}
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-fg-muted">
                No rows match the current filters —{" "}
                <button
                  type="button"
                  className="font-medium text-accent-blue hover:underline"
                  onClick={() =>
                    patchQuery({ severity: null, lifecycle: null, host: null })
                  }
                >
                  reset filters
                </button>
                .
              </p>
            ) : useVirtual ? (
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const e = filtered[vi.index];
                  return (
                    <div
                      key={e.id}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <DriftTableRow e={e} selected={selectedIds.has(e.id)} onSelect={toggleSelect} onOpen={openEvent} />
                    </div>
                  );
                })}
              </div>
            ) : (
              filtered.map((e) => <DriftTableRow key={e.id} e={e} selected={selectedIds.has(e.id)} onSelect={toggleSelect} onOpen={openEvent} />)
            )}
          </div>
        </div>

        <p className="text-xs text-fg-faint">
          Saved views use URL query params (<span className="font-mono">severity</span>,{" "}
          <span className="font-mono">lifecycle</span>, <span className="font-mono">host</span>,{" "}
          <span className="font-mono">event</span>) — mirror future{" "}
          <span className="font-mono">GET /hosts/:id/drift</span> filters.
        </p>

        <CardHint />
      </div>

      {selected ? (
        <DriftInvestigationDrawer event={selected} backHref={driftDrawerBack} />
      ) : null}
    </>
  );
}

function CardHint() {
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-sm text-fg-muted">
      Need fleet context? Cross-check recommended actions on the{" "}
      <Link href="/" className="text-accent-blue hover:underline">
        fleet dashboard
      </Link>
      .
    </div>
  );
}
