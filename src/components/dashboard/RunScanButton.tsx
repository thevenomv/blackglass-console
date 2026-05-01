"use client";

import { Button } from "@/components/ui/Button";
import { useScanJobs } from "@/components/providers/ScanJobsProvider";
import { useSession } from "@/components/auth/SessionProvider";

export function RunScanButton({ label = "Run scan" }: { label?: string }) {
  const { startFleetScan, jobs } = useScanJobs();
  const { loading, allowed } = useSession();
  const busy = jobs.some((j) => j.phase === "queued" || j.phase === "running");

  if (!loading && !allowed("runScan")) {
    return null;
  }

  return (
    <Button type="button" disabled={busy || loading} onClick={() => void startFleetScan()}>
      {label}
    </Button>
  );
}
