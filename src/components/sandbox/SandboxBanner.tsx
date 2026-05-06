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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sandbox", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setSandbox(json.sandbox ?? null);
    } catch {
      // network error — leave as-is
    }
  }, []);

  // Auto-provision when ?sandbox=1 is present and no sandbox exists yet
  useEffect(() => {
    if (params.get("sandbox") !== "1") {
      fetchStatus();
      return;
    }
    // Remove query param from URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("sandbox");
    router.replace(url.pathname + url.search, { scroll: false });

    setProvisioning(true);
    fetch("/api/v1/sandbox", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.message ?? "Failed to provision sandbox");
          setProvisioning(false);
          return;
        }
        const json = await res.json();
        setSandbox(json.sandbox ?? null);
        setProvisioning(false);
      })
      .catch(() => {
        setError("Network error while provisioning sandbox");
        setProvisioning(false);
      });
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
          <strong>Sandbox — drift seeding in progress.</strong> Attack scenario{" "}
          {sandbox.seedPhase}/{MAX_PHASES} applied. Run a scan to see it.
        </span>
      </div>
    );
  }

  if (sandbox?.status === "ready") {
    const expiresLabel = sandbox.ttlExpiresAt
      ? (() => {
          const ms = new Date(sandbox.ttlExpiresAt).getTime() - Date.now();
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
            · drift phase {sandbox.seedPhase}/{MAX_PHASES}
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
      <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-fg-primary">
        <strong>Sandbox error:</strong> {error}
      </div>
    );
  }

  return null;
}
