export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { ReportsView } from "./_components/ReportsView";
import { Skeleton } from "@/components/ui/Skeleton";
import { reports as mockReports } from "@/data/mock/reports";
import { apiConfig } from "@/lib/api/config";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import type { ReportRecord } from "@/data/mock/types";
import { Suspense } from "react";

async function ReportsBody() {
  let reports: ReportRecord[] = [];
  if (apiConfig.useMock && !collectorConfigured()) {
    await mockLatency(220);
    reports = mockReports;
  }
  return <ReportsView reports={reports} />;
}

function ReportsFallback() {
  return (
    <div className="space-y-4 px-6 py-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AppShell>
      <Suspense fallback={<ReportsFallback />}>
        <ReportsBody />
      </Suspense>
    </AppShell>
  );
}
