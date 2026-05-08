"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PermissionGate } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { runBaselineCaptureFromBrowser } from "@/lib/client/baseline-capture";

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
      const result = await runBaselineCaptureFromBrowser();
      if (!result.ok) {
        if (result.detail.includes("Collector is not configured") || result.detail.includes("COLLECTOR_HOST")) {
          toast(result.detail, "warning");
        } else {
          toast(result.detail, "danger");
        }
        return;
      }
      const n = result.captured;
      const f = result.failed;
      toast(
        n
          ? f
            ? `Baseline captured for ${n} host(s); ${f} host(s) reported errors.`
            : `Baseline captured for ${n} host(s).`
          : "Baseline capture completed.",
        "success",
      );
      router.refresh();
    } catch {
      toast("Network error while capturing baseline.", "danger");
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
