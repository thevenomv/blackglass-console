"use client";

import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { DriftEvent } from "@/data/mock/types";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useSession } from "@/components/auth/SessionProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function formatDetected(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function severityLabel(s: DriftEvent["severity"]) {
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  return "Low";
}

function formatVerified(iso?: string) {
  if (!iso) return "—";
  return formatDetected(iso);
}

function lifecycleToneBadge(l: DriftEvent["lifecycle"]): "neutral" | "warning" | "success" | "accent" {
  if (l === "new") return "neutral";
  if (l === "triaged") return "accent";
  if (l === "accepted_risk") return "warning";
  return "success";
}

function lifecycleTitleCase(l: DriftEvent["lifecycle"]) {
  const labels: Record<DriftEvent["lifecycle"], string> = {
    new: "New",
    triaged: "Triaged",
    accepted_risk: "Accepted risk",
    remediated: "Remediated",
    verified: "Verified",
  };
  return labels[l];
}

type Workflow = "open" | "acknowledged" | "approved";

export function DriftInvestigationDrawer({
  event,
  backHref,
}: {
  event: DriftEvent;
  backHref: string;
}) {
  const router = useRouter();
  const { loading, allowed } = useSession();
  const [workflow, setWorkflow] = useState<Workflow>("open");

  const close = useCallback(() => {
    router.replace(backHref);
  }, [router, backHref]);

  const trapRef = useFocusTrap(true, close);
  const canMutate = !loading && allowed("driftMutation");
  const prov = event.provenance;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/55"
      role="presentation"
      onClick={close}
    >
      <aside
        ref={trapRef}
        className="relative z-50 flex h-full w-full max-w-[560px] flex-col border-l border-border-default bg-bg-elevated shadow-elevated outline-none"
        role="dialog"
        aria-labelledby="drift-drawer-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Drift investigation
            </p>
            <h2
              id="drift-drawer-title"
              className="mt-1 text-lg font-semibold leading-snug text-fg-primary"
            >
              {event.title}
            </h2>
            <div className="mt-3 flex flex-wrap gap-3 font-mono text-[12px] text-fg-muted">
              <span>
                Host <span className="text-fg-primary">{event.hostId}</span>
              </span>
              <span className="text-fg-faint">·</span>
              <span>{formatDetected(event.detectedAt)} UTC</span>
              <span className="text-fg-faint">·</span>
              <span
                className={
                  event.severity === "high"
                    ? "text-danger"
                    : event.severity === "medium"
                      ? "text-warning"
                      : "text-fg-faint"
                }
              >
                {severityLabel(event.severity)} severity
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={lifecycleToneBadge(event.lifecycle)}>
                {lifecycleTitleCase(event.lifecycle)}
              </Badge>
            </div>
            {workflow !== "open" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {workflow === "acknowledged" ? (
                  <Badge tone="warning">Acknowledged — pending remediation</Badge>
                ) : (
                  <Badge tone="success">Approved change recorded</Badge>
                )}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" type="button" onClick={close} aria-label="Close drawer">
            Close
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-fg-primary">Why this matters</h3>
            <p className="text-sm leading-relaxed text-fg-muted">{event.rationale}</p>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-fg-primary">Provenance</h3>
            <dl className="grid gap-2 rounded-card border border-border-subtle bg-bg-panel px-4 py-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-fg-faint">Collector / slice</dt>
                <dd className="font-mono text-[12px] text-fg-primary">{prov?.collector ?? "—"}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-fg-faint">Confidence</dt>
                <dd className="text-fg-muted">{prov?.confidenceLabel ?? "Derived from mock payload"}</dd>
              </div>
              {prov?.modelVersion ? (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-fg-faint">Model</dt>
                  <dd className="font-mono text-[12px] text-fg-muted">{prov.modelVersion}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-fg-faint">Verified ingest</dt>
                <dd className="font-mono text-[12px] text-fg-muted">{formatVerified(prov?.verifiedAt)} UTC</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-fg-primary">Signal timeline</h3>
            <ul className="space-y-3 border-l-2 border-border-default pl-4 text-sm text-fg-muted">
              <li>
                <p className="font-medium text-fg-primary">Collector ingested</p>
                <p className="font-mono text-[12px]">{formatVerified(prov?.verifiedAt)} UTC</p>
              </li>
              <li>
                <p className="font-medium text-fg-primary">Drift engine scored</p>
                <p className="font-mono text-[12px]">{formatDetected(event.detectedAt)} UTC</p>
              </li>
            </ul>
          </section>

          <div className="mt-6 space-y-3">
            <CollapsibleSection title="Raw observation payload" defaultOpen={false}>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg-muted">
                {event.evidenceSummary}
              </pre>
            </CollapsibleSection>
          </div>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-medium text-fg-primary">Recommended action</h3>
            <ul className="list-disc space-y-1 pl-4 text-sm text-fg-muted">
              {event.suggestedActions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="shrink-0 border-t border-border-subtle bg-bg-elevated px-6 py-4">
          {!loading && !canMutate ? (
            <p className="text-xs text-fg-faint">
              Auditor role cannot acknowledge or approve drift — escalate to an operator or admin.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canMutate || workflow !== "open"}
                onClick={() => {
                  setWorkflow("acknowledged");
                  void fetch("/api/v1/audit/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "drift_acknowledge",
                      detail: `${event.id} · ${event.hostId} · ${event.title}`,
                    }),
                  });
                }}
              >
                Acknowledge
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={!canMutate || workflow === "approved"}
                onClick={() => {
                  setWorkflow("approved");
                  void fetch("/api/v1/audit/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "drift_approved_change",
                      detail: `${event.id} · ${event.hostId} · ${event.title}`,
                    }),
                  });
                }}
              >
                Mark approved change
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/v1/evidence/bundles/${encodeURIComponent(event.id)}/file`}
              className="inline-flex h-9 items-center justify-center rounded-card border border-border-default bg-bg-panel px-4 text-sm font-medium text-fg-primary transition-colors hover:bg-bg-elevated"
              target="_blank"
              rel="noreferrer"
            >
              Export finding manifest
            </a>
            <Link
              href={`/baselines?host=${event.hostId}`}
              className="inline-flex h-9 items-center px-3 text-sm font-medium text-accent-blue hover:underline"
            >
              Open baseline diff
            </Link>
          </div>
        </footer>
      </aside>
    </div>
  );
}
