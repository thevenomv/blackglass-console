import { AppShell } from "@/components/layout/AppShell";
import { DriftInvestigationDrawer } from "@/components/drift/DriftInvestigationDrawer";
import { HostDetailView } from "@/components/hosts/HostDetailView";
import { Skeleton } from "@/components/ui/Skeleton";
import { getHostDetail } from "@/data/mock/hosts";
import { resolveDriftInvestigation } from "@/lib/resolveInvestigation";
import { mockLatency } from "@/lib/mockLatency";
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
  // Use real collector data when available; fall back to mock.
  const liveDetail = loadHostDetail(id);
  if (!liveDetail) await mockLatency(260);
  const detail = liveDetail ?? getHostDetail(id);
  if (!detail) notFound();

  const investigation = resolveDriftInvestigation(id, { findingSlug: finding });

  return (
    <>
      <HostDetailView detail={detail} />
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
