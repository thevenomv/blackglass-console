"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";

export function BaselinesToolbar() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col items-stretch gap-3 sm:items-end">
      {banner ? (
        <div
          role="status"
          className="w-full rounded-card border border-success/40 bg-success-soft/35 px-4 py-3 text-sm text-fg-primary sm:text-right"
        >
          {banner}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <RunScanButton />
        <Button variant="secondary" type="button">
          Only changes
        </Button>
        <PermissionGate action="acceptBaseline">
          <Button type="button" onClick={() => setConfirmOpen(true)}>
            Accept as new baseline
          </Button>
        </PermissionGate>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Accept snapshot as new baseline?"
        description="This pins the current integrity read as the trusted baseline for drift scoring and audits. Ensure change-management approval exists before confirming."
        confirmLabel="Accept baseline"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => {
          setConfirmOpen(false);
          setNote("");
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          const trimmed = note.trim();
          setBanner(
            trimmed.length
              ? `Baseline acceptance queued (stub) — audit note recorded: ${trimmed}`
              : "Baseline acceptance queued for persistence (stub). Add an audit note next time for stronger traceability.",
          );
          setNote("");
        }}
      >
        <label className="block text-xs font-medium text-fg-faint">
          Audit rationale (recommended)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Change ticket, maintainer, risk acceptance…"
            className="mt-1 w-full resize-y rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue placeholder:text-fg-faint focus:ring-2"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
