"use client";

/**
 * Cloud Inventory Diff Visualiser — drag-drop two JSON files and render a
 * categorised diff.
 *
 * Same architectural pattern as the other tools:
 *   - All logic lives in `src/lib/tools/cloud-inventory-diff/engine.ts`.
 *   - This file owns presentation, file I/O via the FileReader API, and
 *     accessibility.
 *   - Files never leave the browser — File objects are read with FileReader
 *     and discarded after parse.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  diffInventories,
  formatFieldValue,
  InventoryParseError,
  parseInventory,
  type DiffSummary,
  type InventorySnapshot,
  type ResourceDiff,
} from "@/lib/tools/cloud-inventory-diff/engine";
import { trackToolEvent } from "@/lib/tools/analytics";

const TOOL_SLUG = "cloud-inventory-diff";

/**
 * Hard cap on inventory upload size. Real Charon snapshots top out around
 * 1–2 MB even for thousand-host fleets; 10 MB is comfortably above any
 * legitimate hand-rolled export and well below the threshold where a
 * malicious / mistyped JSON would lock up a low-end browser tab.
 *
 * Enforced client-side only: this is a UX guardrail, not a security
 * boundary — there is no upload to defend (FileReader runs locally and
 * the bytes never leave the device).
 */
const MAX_INVENTORY_FILE_BYTES = 10 * 1024 * 1024;

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SlotState {
  fileName: string | null;
  snapshot: InventorySnapshot | null;
  error: string | null;
}

const emptySlot: SlotState = { fileName: null, snapshot: null, error: null };

export function CloudInventoryDiffClient() {
  const [before, setBefore] = useState<SlotState>(emptySlot);
  const [after, setAfter] = useState<SlotState>(emptySlot);

  const openedFiredRef = useRef(false);
  useEffect(() => {
    if (openedFiredRef.current) return;
    openedFiredRef.current = true;
    trackToolEvent("tool_estimator_opened", { tool: TOOL_SLUG });
  }, []);

  const summary = useMemo<DiffSummary | null>(() => {
    if (!before.snapshot || !after.snapshot) return null;
    return diffInventories(before.snapshot, after.snapshot);
  }, [before.snapshot, after.snapshot]);

  // Fire one recompute event per successful diff (no debounce — user has
  // to drop two whole files for this to ever change).
  useEffect(() => {
    if (!summary) return;
    trackToolEvent("tool_estimator_recomputed", {
      tool: TOOL_SLUG,
      added: summary.totals.added,
      removed: summary.totals.removed,
      changed: summary.totals.changed,
    });
  }, [summary]);

  const ingest = useCallback(
    async (slot: "before" | "after", file: File) => {
      const setter = slot === "before" ? setBefore : setAfter;

      // Reject oversized files BEFORE reading — `await file.text()` on a
      // 500 MB JSON would freeze the tab for tens of seconds before any
      // error surfaces. This guard keeps the page responsive and gives
      // the user actionable feedback.
      if (file.size > MAX_INVENTORY_FILE_BYTES) {
        setter({
          fileName: file.name,
          snapshot: null,
          error: `File is ${formatMb(file.size)} — keep snapshots under ${formatMb(MAX_INVENTORY_FILE_BYTES)}. Real Charon exports are well under that.`,
        });
        return;
      }

      try {
        const text = await file.text();
        const snap = parseInventory(text);
        setter({ fileName: file.name, snapshot: snap, error: null });
      } catch (e) {
        const msg =
          e instanceof InventoryParseError
            ? e.message
            : "Could not read this file.";
        setter({ fileName: file.name, snapshot: null, error: msg });
      }
    },
    [],
  );

  const reset = () => {
    setBefore(emptySlot);
    setAfter(emptySlot);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FileSlot
          label="Baseline snapshot"
          slotKey="before"
          slot={before}
          onFile={(f) => void ingest("before", f)}
          onClear={() => setBefore(emptySlot)}
        />
        <FileSlot
          label="Newer snapshot"
          slotKey="after"
          slot={after}
          onFile={(f) => void ingest("after", f)}
          onClear={() => setAfter(emptySlot)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-faint">
        <p>
          Files are parsed in your browser via the FileReader API and discarded immediately. No
          upload, no storage.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          Reset
        </button>
      </div>

      {summary ? (
        <DiffResults summary={summary} />
      ) : (
        <EmptyState before={before} after={after} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------

function FileSlot({
  label,
  slotKey,
  slot,
  onFile,
  onClear,
}: {
  label: string;
  slotKey: string;
  slot: SlotState;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  const stateClass = slot.error
    ? "border-danger/50 bg-danger-soft/10"
    : slot.snapshot
      ? "border-success/40 bg-success-soft/10"
      : dragging
        ? "border-accent-blue bg-accent-blue/10"
        : "border-dashed border-border-default bg-bg-panel";

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-card border p-6 text-center transition-colors ${stateClass}`}
        data-slot={slotKey}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">{label}</p>
        {slot.fileName ? (
          <p className="mt-2 break-all text-sm font-medium text-fg-primary">{slot.fileName}</p>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">
            Drop a JSON file here, or{" "}
            <span className="text-accent-blue underline">choose a file</span>
          </p>
        )}
        {slot.snapshot && (
          <p className="mt-1 text-xs text-fg-faint">
            {slot.snapshot.resources.length} resources parsed
            {slot.snapshot.captured_at ? ` · captured ${slot.snapshot.captured_at}` : ""}
          </p>
        )}
        {slot.error && (
          <p className="mt-2 text-xs text-danger">{slot.error}</p>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
      {slot.fileName && (
        <button
          type="button"
          onClick={() => {
            onClear();
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="self-start text-xs text-fg-faint hover:text-fg-primary"
        >
          Remove file
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ before, after }: { before: SlotState; after: SlotState }) {
  const ready = (before.snapshot ? 1 : 0) + (after.snapshot ? 1 : 0);
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel/60 p-6 text-center text-sm text-fg-muted">
      {ready === 0 && "Drop two JSON inventory snapshots above to see what changed."}
      {ready === 1 && "Drop the second snapshot to compute the diff."}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function DiffResults({ summary }: { summary: DiffSummary }) {
  return (
    <section aria-label="Diff results" className="space-y-5">
      <Totals summary={summary} />
      {summary.warnings.length > 0 && (
        <div className="rounded-card border border-warning/40 bg-warning-soft/30 px-4 py-3 text-xs text-warning">
          {summary.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <ByKind summary={summary} />
      <DiffList summary={summary} />
      <ResultActions />
    </section>
  );
}

function Totals({ summary }: { summary: DiffSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label="Added" count={summary.totals.added} tone="success" />
      <Tile label="Removed" count={summary.totals.removed} tone="danger" />
      <Tile label="Changed" count={summary.totals.changed} tone="warning" />
    </div>
  );
}

function Tile({ label, count, tone }: { label: string; count: number; tone: "success" | "danger" | "warning" }) {
  const cls = {
    success: "border-success/30 bg-success-soft/30 text-success",
    danger: "border-danger/30 bg-danger-soft/30 text-danger",
    warning: "border-warning/30 bg-warning-soft/30 text-warning",
  }[tone];
  return (
    <div className={`rounded-card border p-4 text-center ${cls}`}>
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-1 text-xs uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ByKind({ summary }: { summary: DiffSummary }) {
  if (summary.byKind.length === 0) return null;
  return (
    <details className="rounded-card border border-border-subtle bg-bg-panel/60 p-4 text-xs">
      <summary className="cursor-pointer text-fg-faint hover:text-fg-primary">
        Counts by resource kind
      </summary>
      <table className="mt-3 w-full text-left">
        <thead>
          <tr className="text-fg-faint">
            <th className="py-1 font-medium">Kind</th>
            <th className="py-1 text-right font-medium text-success">Added</th>
            <th className="py-1 text-right font-medium text-danger">Removed</th>
            <th className="py-1 text-right font-medium text-warning">Changed</th>
          </tr>
        </thead>
        <tbody>
          {summary.byKind.map((r) => (
            <tr key={r.kind} className="border-t border-border-subtle">
              <td className="py-1.5 font-mono text-fg-primary">{r.kind}</td>
              <td className="py-1.5 text-right tabular-nums text-fg-muted">{r.added}</td>
              <td className="py-1.5 text-right tabular-nums text-fg-muted">{r.removed}</td>
              <td className="py-1.5 text-right tabular-nums text-fg-muted">{r.changed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function DiffList({ summary }: { summary: DiffSummary }) {
  if (summary.diffs.length === 0) {
    return (
      <div className="rounded-card border border-border-default bg-bg-panel p-6 text-center text-sm text-fg-muted">
        Snapshots are identical — no resources added, removed, or changed.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {summary.diffs.map((d, i) => (
        <DiffRow key={`${d.op}-${d.kind}-${d.id}-${i}`} diff={d} />
      ))}
    </ol>
  );
}

function DiffRow({ diff }: { diff: ResourceDiff }) {
  const tone =
    diff.op === "added"
      ? "border-success/30 bg-success-soft/10"
      : diff.op === "removed"
        ? "border-danger/30 bg-danger-soft/10"
        : "border-warning/30 bg-warning-soft/10";
  const pill =
    diff.op === "added"
      ? "border-success/30 bg-success-soft/40 text-success"
      : diff.op === "removed"
        ? "border-danger/30 bg-danger-soft/40 text-danger"
        : "border-warning/30 bg-warning-soft/40 text-warning";
  return (
    <li className={`rounded-card border px-4 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${pill}`}>
          {diff.op}
        </span>
        <span className="font-mono text-xs text-fg-faint">{diff.kind}</span>
        <span className="break-all font-mono text-fg-primary">{diff.id}</span>
      </div>
      {diff.changes && diff.changes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {diff.changes.map((c) => (
            <li key={c.field} className="grid grid-cols-[6rem_1fr_auto_1fr] items-center gap-2 leading-snug">
              <span className="font-mono text-fg-faint">{c.field}</span>
              <span className="break-all text-fg-muted">{formatFieldValue(c.before)}</span>
              <span aria-hidden className="text-fg-faint">→</span>
              <span className="break-all text-fg-primary">{formatFieldValue(c.after)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ResultActions() {
  return (
    <div className="rounded-card border border-accent-blue/25 bg-accent-blue/5 px-5 py-4">
      <p className="text-sm font-semibold text-fg-primary">
        Want this for every scan, automatically?
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Charon snapshots inventory across DO, AWS, and GCP and surfaces scan-over-scan diffs with
        idle scoring and approval-gated cleanup.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/product#charon"
          onClick={() =>
            trackToolEvent("tool_charon_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
            })
          }
          className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover"
        >
          See Charon →
        </Link>
        <Link
          href="/demo?source=tools-cloud-inventory-diff-result"
          onClick={() =>
            trackToolEvent("tool_demo_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
            })
          }
          className="inline-flex items-center justify-center rounded-md border border-accent-blue/40 bg-bg-base px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/10"
        >
          Explore a sample workspace
        </Link>
      </div>
    </div>
  );
}
