"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PermissionGate } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function Spinner() {
  return (
    <svg aria-hidden className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function CaptureBaselineButton({
  className = "",
  variant = "secondary" as const,
}: {
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/baselines", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(38_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        captured?: unknown[];
      };
      if (res.status === 503 && body.error === "collector_not_configured") {
        toast(body.detail ?? "Collector is not configured.", "warning");
        return;
      }
      if (!res.ok) {
        toast(body.detail ?? body.error ?? `Baseline capture failed (HTTP ${res.status}).`, "danger");
        return;
      }
      const n = Array.isArray(body.captured) ? body.captured.length : 0;
      toast(n ? `Baseline captured for ${n} host(s).` : "Baseline capture completed.", "success");
      router.refresh();
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      toast(isTimeout ? "Baseline capture timed out — check collector host connectivity." : "Network error while capturing baseline.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGate action="captureBaseline">
      <Button type="button" variant={variant} className={className} disabled={busy} onClick={() => void run()}>
        {busy ? (
          <span className="flex items-center gap-2">
            <Spinner /> Capturing…
          </span>
        ) : (
          "Capture baseline"
        )}
      </Button>
    </PermissionGate>
  );
}
