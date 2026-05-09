"use client";

/**
 * SandboxBanner — shown at the top of the dashboard when:
 *   1. The URL includes `?sandbox=1` (first login via "Launch live sandbox" CTA), OR
 *   2. The tenant has an active sandbox in provisioning/ready/seeding state.
 *
 * On mount with `?sandbox=1`, it auto-triggers POST /api/v1/sandbox and starts polling.
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type SandboxStatus = "provisioning" | "ready" | "seeding" | "error" | "destroying" | "destroyed";

type SandboxRow = {
  id: string;
  status: SandboxStatus;
  dropletIp: string | null;
  seedPhase: number;
  ttlExpiresAt: string | null;
};

const POLL_MS = 8_000;
const MAX_PHASES = 4;

export function SandboxBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const [sandbox, setSandbox] = useState<SandboxRow | null | "loading">("loading");
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tick once a minute so the "expires in Xh Ym" label re-renders
  // without us calling Date.now() during render (which the React
  // Compiler purity rule rejects). The tick is the actual current
  // ms — recomputing the label off this state is pure.
  const [nowMs, setNowMs] = useState<number>(() => 0);
  useEffect(() => {
    // Bridge the wall clock (external system) into React state so
    // expiry labels re-render without calling Date.now() in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sandbox", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
          error?: string;
        };
        // Stale state failures aren't worth shouting about, but the
        // operator deserves a hint that they should refresh manually
        // if the chip stays stuck. The retry button below picks this
        // up directly.
        setError(body.detail ?? body.error ?? `Status check failed (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      setSandbox(json.sandbox ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error reading sandbox status");
    }
  }, []);

  const provisionOnce = useCallback(async () => {
    setProvisioning(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/sandbox", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
          error?: string;
          message?: string;
        };
        setError(
          body.detail ?? body.error ?? body.message ?? "Failed to provision sandbox",
        );
        return;
      }
      const json = await res.json();
      setSandbox(json.sandbox ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error while provisioning sandbox",
      );
    } finally {
      setProvisioning(false);
    }
  }, []);

  // Auto-provision when ?sandbox=1 is present and no sandbox exists yet.
  // Compiler rule wants Suspense but this is a side-effect-on-mount
  // (POST /sandbox provisioning) that doesn't fit the Suspense model.
  useEffect(() => {
    if (params.get("sandbox") !== "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchStatus();
      return;
    }
    // Remove query param from URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("sandbox");
    router.replace(url.pathname + url.search, { scroll: false });

    void provisionOnce();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while provisioning / seeding
  useEffect(() => {
    if (!sandbox || sandbox === "loading") return;
    if (sandbox.status === "ready" || sandbox.status === "error" || sandbox.status === "destroyed") return;

    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [sandbox, fetchStatus]);

  if (sandbox === "loading") return null;
  if (sandbox === null && !provisioning) return null;

  if (provisioning || sandbox?.status === "provisioning") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-3 text-sm text-fg-primary">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        <span>
          <strong>Sandbox provisioning…</strong> A fresh Ubuntu VM is being created for you.
          This takes about 90 seconds.
        </span>
      </div>
    );
  }

  if (sandbox?.status === "seeding") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-fg-primary">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-400" />
        <span>
          <strong>Sandbox — sample changes in progress.</strong> Attack scenario{" "}
          {sandbox.seedPhase}/{MAX_PHASES} applied. Run a scan to see it.
        </span>
      </div>
    );
  }

  if (sandbox?.status === "ready") {
    const expiresLabel = sandbox.ttlExpiresAt && nowMs > 0
      ? (() => {
          const ms = new Date(sandbox.ttlExpiresAt).getTime() - nowMs;
          const h = Math.floor(ms / 3_600_000);
          const m = Math.floor((ms % 3_600_000) / 60_000);
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        })()
      : null;

    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-fg-primary">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span>
          <strong>Sandbox ready</strong>{" "}
          <span className="font-mono text-xs text-fg-muted">{sandbox.dropletIp}</span>
          {expiresLabel && (
            <span className="ml-2 text-xs text-fg-faint">· expires in {expiresLabel}</span>
          )}
          <span className="ml-2 text-xs text-fg-faint">
            · scenario phase {sandbox.seedPhase}/{MAX_PHASES}
          </span>
        </span>
        <button
          onClick={() =>
            fetch("/api/v1/sandbox", { method: "DELETE" }).then(() => setSandbox(null))
          }
          className="ml-auto text-xs text-fg-faint hover:text-fg-muted"
        >
          Destroy
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-fg-primary">
        <span>
          <strong>Sandbox error:</strong> {error}
        </span>
        <button
          type="button"
          onClick={() => void provisionOnce()}
          disabled={provisioning}
          className="ml-auto rounded-md border border-border-default bg-bg-panel px-3 py-1 text-xs font-medium text-fg-primary transition-colors hover:border-border-strong disabled:opacity-60"
        >
          {provisioning ? "Retrying…" : "Retry provision"}
        </button>
      </div>
    );
  }

  return null;
}
