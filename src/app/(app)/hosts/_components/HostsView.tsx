"use client";

/* eslint-disable react-hooks/incompatible-library -- TanStack Virtual's useVirtualizer is intentionally skipped by the React Compiler */
import type { HostRecord } from "@/data/mock/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunScanButton } from "@/app/(app)/dashboard/_components/RunScanButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { HostTrustPill } from "@/components/ui/HostTrustPill";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { useToast } from "@/components/ui/Toast";
import { formatAbsoluteUtc, formatRelativeTime } from "@/lib/format-time";

type Filter = "all" | "aligned" | "drift" | "needs_review";

/** Below this count, render rows directly so SSR/hydration always shows data (virtualizer needs a mounted scroll parent). */
const VIRTUAL_THRESHOLD = 48;

export function HostsView({
  hosts,
  atCap = false,
  hostCap = null,
}: {
  hosts: HostRecord[];
  atCap?: boolean;
  hostCap?: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Local hide-list lets the row vanish instantly while the server cache
  // revalidates — Next's `router.refresh()` repopulates from the source of
  // truth on the next tick. This avoids a one-second "row still there"
  // flicker after a successful delete.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (host: HostRecord) => {
    const confirmed = window.confirm(
      `Delete host "${host.hostname}" (${host.id})?\n\n` +
        `This forgets its baseline, drift events, and any matching scan ` +
        `registration. The host is also tombstoned for 24h so a still-running ` +
        `push-agent can't immediately re-register it.\n\n` +
        `This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(host.id);
    try {
      const res = await fetch(`/api/v1/hosts/${encodeURIComponent(host.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
        toast(body.detail ?? body.message ?? `Could not delete host (HTTP ${res.status}).`, "danger");
        return;
      }
      toast(`${host.hostname} deleted.`, "success");
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(host.id);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(host.id);
        return next;
      });
      router.refresh();
    } catch {
      toast("Delete failed — network error.", "danger");
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk delete fans out the same per-host endpoint with Promise.allSettled
  // so a single 404 / 502 doesn't block the rest of the batch. Failures
  // stay selected so the operator can retry without re-picking from
  // scratch (matches the Settings → Collector hosts pattern).
  const handleBulkDelete = async () => {
    const ids = [...selectedIds].filter((id) => !hiddenIds.has(id));
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} host${ids.length === 1 ? "" : "s"}?\n\n` +
        `Each host's baseline, drift events, and scan registration are ` +
        `forgotten. Each is tombstoned for 24h to prevent immediate ` +
        `resurrection by a still-running push-agent.\n\n` +
        `This cannot be undone.`,
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const res = await fetch(`/api/v1/hosts/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          throw new Error(`HTTP ${res.status}`);
        }
        return id;
      }),
    );
    const okIds = new Set(
      settled
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value),
    );
    const failedIds = new Set(
      settled
        .map((r, i) => (r.status === "rejected" ? ids[i] : null))
        .filter((id): id is string => id !== null),
    );
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of okIds) next.add(id);
      return next;
    });
    setSelectedIds(failedIds);
    setBulkDeleting(false);
    if (failedIds.size === 0) {
      toast(`${okIds.size} host${okIds.size === 1 ? "" : "s"} deleted.`, "success");
    } else if (okIds.size === 0) {
      toast(`Bulk delete failed for all ${failedIds.size} hosts.`, "danger");
    } else {
      toast(
        `${okIds.size} deleted, ${failedIds.size} failed. Failed hosts kept selected for retry.`,
        "warning",
      );
    }
    router.refresh();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hosts.filter((h) => {
      if (hiddenIds.has(h.id)) return false;
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
  }, [hosts, query, filter, hiddenIds]);

  const visibleIds = filtered.map((h) => h.id);
  const effectiveSelectedIds = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected =
    visibleIds.length > 0 && effectiveSelectedIds.length === visibleIds.length;
  const someVisibleSelected =
    effectiveSelectedIds.length > 0 && effectiveSelectedIds.length < visibleIds.length;
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? filtered.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    enabled: useVirtual,
  });

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "aligned", label: "Healthy" },
    { id: "drift", label: "Changed" },
    { id: "needs_review", label: "Needs review" },
  ];

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-6">
      <PageHeader
        title="Hosts"
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/hosts", label: "Hosts" },
        ]}
        actions={<RunScanButton />}
      />

      {atCap && hostCap !== null && (
        <UpgradePrompt
          feature={`Host limit reached (${hostCap} on Local plan)`}
          description="Move to Team for a higher host quota, or Enterprise for unlimited — see Pricing for details."
        />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search hosts…"
          aria-label="Search hosts by hostname, id, or OS"
          className="w-full max-w-md rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
        />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Host filters">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === c.id
                  ? "border-accent-blue bg-accent-blue-soft text-accent-blue"
                  : "border-border-subtle text-fg-muted hover:border-border-default hover:text-fg-primary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {effectiveSelectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Bulk host actions"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-blue/40 bg-accent-blue-soft/20 px-4 py-2.5 text-sm"
        >
          <span className="text-fg-primary">
            <span className="font-semibold">{effectiveSelectedIds.length}</span> of{" "}
            {filtered.length} hosts selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              disabled={bulkDeleting}
              className="rounded-md border border-danger/40 bg-danger-soft/20 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft/40 disabled:opacity-50"
            >
              {bulkDeleting
                ? "Deleting…"
                : `Delete ${effectiveSelectedIds.length} host${effectiveSelectedIds.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-subtle hover:text-fg-primary disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No hosts match this view"
          description="Adjust search or filters, or run a scan once collectors are connected."
          action={<RunScanButton />}
        />
      ) : (
        <div
          role="region"
          aria-label="Hosts inventory"
          className="overflow-hidden rounded-card border border-border-default bg-bg-panel"
        >
          <div className="flex items-center border-b border-border-subtle px-4 py-2.5 text-[11px] uppercase tracking-wide text-fg-faint">
            <div className="w-7 shrink-0">
              <input
                type="checkbox"
                aria-label="Select all visible hosts"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someVisibleSelected;
                }}
                onChange={toggleSelectAllVisible}
                disabled={bulkDeleting}
                className="h-3.5 w-3.5 cursor-pointer accent-accent-blue"
              />
            </div>
            <div className="min-w-0 flex-[1.4] font-medium">Host</div>
            <div className="w-36 font-medium">Posture</div>
            <div className="w-16 text-right font-medium">Ready</div>
            <div className="min-w-0 flex-1 px-4 font-medium">Last scan</div>
            <div className="w-24 text-right font-medium">
              <span className="sr-only">Actions</span>
            </div>
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
                  const h = filtered[vi.index]!;
                  return (
                    <div
                      key={h.id}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <HostRow
                        host={h}
                        checked={selectedIds.has(h.id)}
                        deleting={deletingId === h.id}
                        bulkDeleting={bulkDeleting}
                        onToggle={() => toggleSelected(h.id)}
                        onDelete={() => void handleDelete(h)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              filtered.map((h) => (
                <HostRow
                  key={h.id}
                  host={h}
                  checked={selectedIds.has(h.id)}
                  deleting={deletingId === h.id}
                  bulkDeleting={bulkDeleting}
                  onToggle={() => toggleSelected(h.id)}
                  onDelete={() => void handleDelete(h)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single inventory row. Pulled out so the virtualized and non-virtualized
 * branches share one definition — keeps the "less is more" UX consistent
 * across both rendering paths.
 *
 * UX notes:
 *  - The host id is itself the navigation link; we no longer ship a separate
 *    "Open" column, which removes ~50% of the per-row visual noise.
 *  - The delete button stays always-visible (operators previously complained
 *    that delete was buried), but it's a low-weight ghost so it doesn't
 *    dominate the row.
 *  - No zebra striping; row hover and selected-state tinting are enough to
 *    keep rows distinct.
 */
function HostRow({
  host,
  checked,
  deleting,
  bulkDeleting,
  onToggle,
  onDelete,
}: {
  host: HostRecord;
  checked: boolean;
  deleting: boolean;
  bulkDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex w-full items-center border-b border-border-subtle px-4 py-3 text-sm transition-colors hover:bg-bg-elevated ${
        checked ? "bg-accent-blue-soft/10" : ""
      }`}
    >
      <div className="w-7 shrink-0">
        <input
          type="checkbox"
          aria-label={`Select ${host.hostname}`}
          checked={checked}
          onChange={onToggle}
          disabled={bulkDeleting || deleting}
          className="h-3.5 w-3.5 cursor-pointer accent-accent-blue"
        />
      </div>
      <div className="min-w-0 flex-[1.4]">
        <Link
          href={`/hosts/${host.id}`}
          className="font-mono text-fg-primary hover:text-accent-blue hover:underline"
        >
          {host.id}
        </Link>
        <p className="truncate text-xs text-fg-faint">{host.os}</p>
      </div>
      <div className="w-36">
        <HostTrustPill trust={host.trust} />
      </div>
      <div className="w-16 tabular-nums text-right text-fg-muted">{host.readinessScore}%</div>
      <div
        className="min-w-0 flex-1 px-4 text-fg-muted"
        title={host.lastScanAt ? formatAbsoluteUtc(host.lastScanAt) : "No scan signal yet"}
      >
        {host.lastScanAt ? formatRelativeTime(host.lastScanAt) : "Never"}
      </div>
      <div className="flex w-24 items-center justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete host ${host.hostname}`}
          title="Forget this host (baseline + drift events). Cannot be undone."
          className="rounded-md px-2 py-1 text-xs font-medium text-fg-faint transition-colors hover:bg-danger-soft/30 hover:text-danger disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
