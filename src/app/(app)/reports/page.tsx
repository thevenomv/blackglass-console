export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { ReportsView } from "./_components/ReportsView";
import { Skeleton } from "@/components/ui/Skeleton";
import { reports as mockReports } from "@/data/mock/reports";
import { apiConfig } from "@/lib/api/config";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import { listReports } from "@/lib/server/report-store";
import type { ReportRecord } from "@/data/mock/types";
import { Suspense } from "react";

async function ReportsBody() {
  if (apiConfig.useMock && !collectorConfigured()) {
    await mockLatency(220);
    return <ReportsView reports={mockReports} />;
  }
  const items = await listReports();
  const reports: ReportRecord[] = items.map((r) => ({
    id: r.id,
    title: r.title,
    scope: r.scope,
    generatedAt: r.generatedAt,
    status: r.status,
    format: r.format,
  }));
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
