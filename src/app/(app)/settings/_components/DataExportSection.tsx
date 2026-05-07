"use client";

/**
 * Data export panel — request a tenant-wide export and see the recent jobs.
 *
 * Backed by /api/v1/exports + /api/v1/exports/[id]/download.  Polling tracks
 * a 'running' job until it reaches a terminal state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface ExportRow {
  id: string;
  status: "queued" | "running" | "ready" | "failed" | "expired";
  requestedBy: string | null;
  deliverTo: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function statusTone(s: ExportRow["status"]): "neutral" | "success" | "warning" | "accent" {
  if (s === "ready") return "success";
  if (s === "failed" || s === "expired") return "warning";
  if (s === "running" || s === "queued") return "accent";
  return "neutral";
}

function fmtSize(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}

export function DataExportSection() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [deliverTo, setDeliverTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/exports", { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = (await res.json()) as { exports: ExportRow[] };
      setRows(json.exports ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setState happens after await inside fetchOnce — same pattern used
    // elsewhere in Settings; the rule fires on the call site regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
  }, [fetchOnce]);

  // Poll while any export is still running.
  useEffect(() => {
    const inFlight = rows.some((r) => r.status === "queued" || r.status === "running");
    if (!inFlight) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => void fetchOnce(), 2_000);
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [rows, fetchOnce]);

  async function requestExport() {
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deliverTo ? { deliverTo } : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `Server returned ${res.status}`);
      }
      await fetchOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Notify email (optional)
          </span>
          <input
            type="email"
            placeholder="leave blank to skip"
            value={deliverTo}
            onChange={(e) => setDeliverTo(e.target.value)}
            className="h-8 w-64 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
          />
        </label>
        <Button variant="primary" disabled={requesting} onClick={() => void requestExport()}>
          {requesting ? "Requesting…" : "Request data export"}
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {loading ? (
        <p className="text-xs text-fg-faint">Loading recent exports…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-fg-faint">No exports requested yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded border border-border-subtle bg-bg-panel-elevated">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              <span className="font-mono text-[11px] text-fg-faint">
                {new Date(r.createdAt).toLocaleString("en-GB")}
              </span>
              <span className="text-fg-muted">{fmtSize(r.sizeBytes)}</span>
              {r.expiresAt ? (
                <span className="text-fg-faint">
                  expires {new Date(r.expiresAt).toLocaleDateString("en-GB")}
                </span>
              ) : null}
              {r.status === "ready" ? (
                <a
                  href={`/api/v1/exports/${r.id}/download`}
                  className="ml-auto rounded border border-border-default bg-bg-panel px-2 py-1 text-fg-primary hover:bg-bg-elevated"
                >
                  Download
                </a>
              ) : null}
              {r.errorMessage ? (
                <p className="basis-full text-[11px] text-danger">{r.errorMessage}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
