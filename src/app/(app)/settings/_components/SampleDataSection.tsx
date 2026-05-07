"use client";

/**
 * Per-browser sample-data toggle.
 *
 * Flips the `bg-sample-data` cookie via POST /api/v1/preferences/sample-data,
 * then reloads so server components pick up the new state.
 *
 * Initial state is read client-side from the cookie itself rather than
 * round-tripping through a server prop, so the toggle is always in sync
 * with what the next reload will actually render.
 */

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const SAMPLE_DATA_COOKIE = "bg-sample-data";

function readCookieEnabled(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${SAMPLE_DATA_COOKIE}=on`));
}

// External-store plumbing for the cookie state. There's no DOM event for
// cookie writes, so we rely on `bumpCookieVersion` after our own mutation
// to force re-reads. Other tabs flipping the cookie won't be reflected
// until reload — fine for this UI surface.
let cookieVersion = 0;
const cookieListeners = new Set<() => void>();
function subscribeCookie(onChange: () => void): () => void {
  cookieListeners.add(onChange);
  return () => cookieListeners.delete(onChange);
}
function bumpCookieVersion() {
  cookieVersion++;
  for (const l of cookieListeners) l();
}
function getCookieSnapshot(): boolean {
  // Read each call so a manual `document.cookie = ...` from devtools is
  // picked up after the next bump. Local var prevents the lint flag for
  // unused identifier.
  void cookieVersion;
  return readCookieEnabled();
}

export function SampleDataSection({ collectorConfigured }: { collectorConfigured: boolean }) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const enabled = useSyncExternalStore(subscribeCookie, getCookieSnapshot, () => false);
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = async (next: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/preferences/sample-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        toastRef.current("Could not update preference.", "danger");
        return;
      }
      // Cookie was updated server-side; nudge useSyncExternalStore so the
      // visible button label flips before the reload completes.
      bumpCookieVersion();
      toastRef.current(
        next
          ? "Sample data enabled — reload any tab to see the demo fleet."
          : "Sample data disabled.",
        "success",
      );
      // Force a reload so server components pick up the new cookie state.
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      toastRef.current("Network error updating preference.", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg-primary">Sample data</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Show a pre-built demo fleet (8 hosts, mixed drift, sample evidence)
            instead of live data. Useful for new workspaces, customer demos, and
            previewing the UI before connecting a host.
          </p>
          <p className="mt-1 text-xs text-fg-faint">
            Per-browser only — turning it on doesn&apos;t affect other operators
            in this workspace. Disabled automatically once a real collector is
            configured.
          </p>
        </div>
        <Button
          type="button"
          variant={enabled ? "secondary" : "primary"}
          onClick={() => void handleToggle(!enabled)}
          disabled={submitting}
        >
          {submitting ? "Saving…" : enabled ? "Disable sample data" : "Enable sample data"}
        </Button>
      </div>

      {enabled && collectorConfigured ? (
        <div className="rounded-card border border-warning/40 bg-warning-soft/25 px-3 py-2 text-xs text-fg-muted">
          A collector is configured for this workspace, so live data is
          rendered even with sample data enabled — disable below once you no
          longer need it.
        </div>
      ) : null}
    </section>
  );
}
