export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { DriftInvestigationDrawer } from "../../drift/_components/DriftInvestigationDrawer";
import { HostDetailView } from "../_components/HostDetailView";
import { Skeleton } from "@/components/ui/Skeleton";
import { resolveDriftInvestigation } from "@/lib/resolveInvestigation";
import { collectorConfigured } from "@/lib/server/collector";
import { loadHostDetail } from "@/lib/server/inventory";
import { notFound } from "next/navigation";
import { Suspense } from "react";

async function HostDetailBody({
  id,
  finding,
}: {
  id: string;
  finding?: string;
}) {
  const liveDetail = await loadHostDetail(id);
  if (!liveDetail) {
    if (collectorConfigured()) notFound();
    notFound();
  }

  const investigation = resolveDriftInvestigation(id, { findingSlug: finding });

  return (
    <>
      <HostDetailView detail={liveDetail} />
      {investigation ? (
        <DriftInvestigationDrawer event={investigation} backHref={`/hosts/${id}`} />
      ) : null}
    </>
  );
}

function HostDetailFallback() {
  return (
    <div className="space-y-4 px-6 py-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default async function HostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ finding?: string }>;
}) {
  const { id } = await params;
  const { finding } = await searchParams;

  return (
    <AppShell>
      <Suspense fallback={<HostDetailFallback />}>
        <HostDetailBody id={id} finding={finding} />
      </Suspense>
    </AppShell>
  );
}
