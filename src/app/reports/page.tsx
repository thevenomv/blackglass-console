export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { ReportsView } from "@/components/reports/ReportsView";
import { Skeleton } from "@/components/ui/Skeleton";
import { reports } from "@/data/mock/reports";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";

async function ReportsBody() {
  await mockLatency(220);
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
