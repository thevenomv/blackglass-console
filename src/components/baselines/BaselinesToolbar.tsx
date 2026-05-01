"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

function Spinner() {
  return (
    <svg aria-hidden className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function BaselinesToolbar() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [accepting, setAccepting] = useState(false);

  return (
    <div className="flex w-full flex-col items-stretch gap-3 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <RunScanButton />
        <Button variant="secondary" type="button">
          Only changes
        </Button>
        <PermissionGate action="acceptBaseline">
          <Button type="button" disabled={accepting} onClick={() => setConfirmOpen(true)}>
            {accepting ? (
              <span className="flex items-center gap-2"><Spinner /> Accepting…</span>
            ) : "Accept as new baseline"}
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
          setAccepting(true);
          void fetch("/api/v1/audit/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "baseline_accept",
              detail: trimmed.length
                ? trimmed
                : "accepted without rationale note (stub queue)",
            }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server responded ${res.status}`);
              toast(
                trimmed.length
                  ? `Baseline acceptance queued — audit note recorded.`
                  : "Baseline acceptance queued. Add an audit note next time for stronger traceability.",
                "success",
              );
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : "Unknown error";
              toast(`Acceptance failed: ${msg}`, "danger");
            })
            .finally(() => {
              setAccepting(false);
              setNote("");
            });
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
