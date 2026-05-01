"use client";

import type { DriftEvent } from "@/data/mock/types";
import { Badge } from "@/components/ui/Badge";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { DriftInvestigationDrawer } from "@/components/drift/DriftInvestigationDrawer";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUAL_THRESHOLD = 48;

function formatDetected(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DriftTableRow({
  e,
  onOpen,
}: {
  e: DriftEvent;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full cursor-pointer items-center border-b border-border-subtle px-4 py-3 text-sm hover:bg-bg-elevated"
      onClick={() => onOpen(e.id)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen(e.id);
        }
      }}
    >
      <div className="min-w-0 flex-[1.1] text-fg-muted">{formatDetected(e.detectedAt)} UTC</div>
      <div className="w-28 font-mono text-fg-primary">{e.hostId}</div>
      <div className="min-w-0 flex-1 truncate px-3 text-fg-muted">{e.title}</div>
      <div className="w-24">
        <Badge
          tone={
            e.severity === "high"
              ? "danger"
              : e.severity === "medium"
                ? "warning"
                : "neutral"
          }
        >
          {e.severity}
        </Badge>
      </div>
      <div className="w-16 text-right">
        <button
          type="button"
          className="text-xs font-semibold text-accent-blue hover:underline"
          onClick={(ev) => {
            ev.stopPropagation();
            onOpen(e.id);
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}

export function DriftEventsView({
  events,
  selected,
}: {
  events: DriftEvent[];
  selected?: DriftEvent;
}) {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);

  const openEvent = (id: string) => {
    router.push(`/drift?event=${id}`);
  };

  const useVirtual = events.length > VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? events.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 8,
    enabled: useVirtual,
  });

  return (
    <>
      <div className="flex flex-col gap-6 px-6 pb-10 pt-6">
        <PageHeader
          title="Drift"
          subtitle="High-signal deltas grouped by integrity class — open an event to investigate."
          breadcrumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/drift", label: "Drift" },
          ]}
          actions={<RunScanButton />}
        />

        <nav
          aria-label="Integrity workflow shortcuts"
          className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted"
        >
          <Link href="/baselines" className="font-medium text-accent-blue hover:underline">
            Baselines
          </Link>
          <span aria-hidden className="text-fg-faint">
            →
          </span>
          <span className="font-medium text-fg-primary">Drift triage</span>
          <span aria-hidden className="text-fg-faint">
            →
          </span>
          <Link href="/evidence" className="font-medium text-accent-blue hover:underline">
            Evidence export
          </Link>
        </nav>

        <div className="overflow-hidden rounded-card border border-border-default bg-bg-panel">
          <div className="flex border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-fg-faint">
            <div className="min-w-0 flex-[1.1] font-medium">Detection time</div>
            <div className="w-28 font-medium">Host</div>
            <div className="min-w-0 flex-1 px-3 font-medium">Title</div>
            <div className="w-24 font-medium">Severity</div>
            <div className="w-16 text-right font-medium"> </div>
          </div>
          <div
            ref={parentRef}
            className="max-h-[min(480px,65vh)] overflow-auto"
            style={useVirtual ? { contain: "strict" } : undefined}
          >
            {useVirtual ? (
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const e = events[vi.index];
                  return (
                    <div
                      key={e.id}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <DriftTableRow e={e} onOpen={openEvent} />
                    </div>
                  );
                })}
              </div>
            ) : (
              events.map((e) => <DriftTableRow key={e.id} e={e} onOpen={openEvent} />)
            )}
          </div>
        </div>

        <p className="text-xs text-fg-faint">
          Rows mirror future <span className="font-mono">GET /hosts/:id/drift</span> payloads —
          severity drives paging policies and webhook routing.
        </p>

        <CardHint />
      </div>

      {selected ? <DriftInvestigationDrawer event={selected} backHref="/drift" /> : null}
    </>
  );
}

function CardHint() {
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-sm text-fg-muted">
      Need fleet context? Cross-check recommended actions on the{" "}
      <Link href="/" className="text-accent-blue hover:underline">
        fleet dashboard
      </Link>
      .
    </div>
  );
}
