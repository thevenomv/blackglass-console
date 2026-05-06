"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useScanJobs } from "@/components/providers/ScanJobsProvider";
import { useSession } from "@/components/auth/SessionProvider";

export function RunScanButton({ label = "Run scan" }: { label?: string }) {
  const { startFleetScan, jobs } = useScanJobs();
  const { loading, allowed } = useSession();
  const busy = jobs.some((j) => j.phase === "queued" || j.phase === "running");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Suppress SSR render — this component relies entirely on client state.
  if (!mounted) return null;
  if (!loading && !allowed("runScan")) return null;

  return (
    <Button type="button" disabled={busy} onClick={() => void startFleetScan()}>
      {label}
    </Button>
  );
}
