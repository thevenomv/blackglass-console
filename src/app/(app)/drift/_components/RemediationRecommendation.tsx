"use client";

/**
 * AI-proposed remediation panel — shown inside DriftInvestigationDrawer when
 * blackglass-remediator has produced a recommendation for the drift event.
 *
 * - Polls /api/v1/remediations?driftEventId once on mount.
 * - Renders status badge, confidence, and the proposed plan.
 * - Approve / Reject buttons hit /api/v1/remediations/{id}/{action}.
 * - Commands are NEVER auto-executed; the remediator drives any later steps.
 */

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface PlanCommand {
  command?: string;
  purpose?: string;
  risk_level?: string;
  destructive?: boolean;
}

interface PlanShape {
  summary?: string;
  confidence_score?: number;
  /**
   * Set by the remediator's `apply_confidence_cap()` when the LLM's
   * raw score exceeded the per-category ceiling
   * (CATEGORY_CONFIDENCE_CAP). Undefined on legacy plans, treated as
   * "not capped" — the UI shows the cap badge only when this is true.
   */
  confidence_capped?: boolean;
  requires_human_approval?: boolean;
  commands?: PlanCommand[];
  verification_steps?: Array<{ command?: string; purpose?: string }>;
}

interface RemediationView {
  id: string;
  remediationId: string;
  status: "draft" | "awaiting_approval" | "approved" | "rejected" | "expired";
  riskPolicyTier: string;
  summary: string;
  plan: PlanShape;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

function statusTone(s: RemediationView["status"]): "neutral" | "accent" | "success" | "warning" {
  if (s === "awaiting_approval") return "accent";
  if (s === "approved") return "success";
  if (s === "rejected" || s === "expired") return "warning";
  return "neutral";
}

function statusLabel(s: RemediationView["status"]): string {
  if (s === "awaiting_approval") return "Awaiting approval";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  if (s === "expired") return "Expired";
  return "Draft";
}

export function RemediationRecommendation({
  driftEventId,
  canMutate,
}: {
  driftEventId: string;
  canMutate: boolean;
}) {
  const [recommendation, setRecommendation] = useState<RemediationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Standard fetch-on-mount: setState toggle drives the spinner.
    // The React Compiler rule prefers Suspense here, but the
    // remediator is an optional service and we'd rather degrade
    // to "no recommendation" than crash a Suspense boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/v1/remediations?driftEventId=${encodeURIComponent(driftEventId)}`)
      .then((r) => r.json())
      .then((j: { remediation: RemediationView | null }) => {
        if (!cancelled) setRecommendation(j.remediation ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [driftEventId]);

  const confidencePct = useMemo(() => {
    const c = recommendation?.plan?.confidence_score;
    return typeof c === "number" ? Math.round(c * 100) : null;
  }, [recommendation?.plan?.confidence_score]);

  /**
   * Visual band for the confidence score. Thresholds are the same
   * ones the remediator uses internally to decide which tier of
   * suggestion to surface — see blackglass-remediator/app/agent/risk_policy.py.
   *
   *   ≥ 75 → green   ("auto-suggestable" if other gates allow)
   *   50–74 → amber  ("operator review recommended")
   *   < 50 → red    ("treat as guidance — likely needs manual investigation")
   */
  const confidenceBand = useMemo<{
    label: string;
    color: string;
    explanation: string;
  } | null>(() => {
    if (confidencePct === null) return null;
    if (confidencePct >= 75)
      return {
        label: "high",
        color: "text-success",
        explanation:
          "High confidence — the remediator is sure of both the diagnosis and the proposed fix. Review and approve when ready.",
      };
    if (confidencePct >= 50)
      return {
        label: "medium",
        color: "text-warning",
        explanation:
          "Medium confidence — the proposal is plausible but the remediator flagged uncertainty. Read each command before approving.",
      };
    return {
      label: "low",
      color: "text-danger",
      explanation:
        "Low confidence — treat the plan as guidance only. Investigate the drift manually before applying anything.",
    };
  }, [confidencePct]);

  async function decide(action: "approve" | "reject") {
    if (!recommendation || pending) return;
    setPending(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/remediations/${encodeURIComponent(recommendation.remediationId)}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = (await res.json()) as { remediation: RemediationView };
      setRecommendation(json.remediation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-4 rounded-card border border-border-subtle bg-bg-panel px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
          AI remediation
        </p>
        <p className="mt-2 text-sm text-fg-muted">Checking for a proposed plan…</p>
      </section>
    );
  }

  if (!recommendation) {
    return null; // No recommendation for this drift event — section is hidden.
  }

  const commands = recommendation.plan.commands ?? [];
  const decisionDisabled =
    !canMutate || recommendation.status === "approved" || recommendation.status === "rejected";

  return (
    <section className="mt-4 space-y-3 rounded-card border border-border-subtle bg-bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
          AI remediation proposal
        </p>
        <div className="flex items-center gap-2">
          {confidencePct !== null && confidenceBand ? (
            <span
              className={`inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-0.5 text-[11px] font-semibold ${confidenceBand.color}`}
              title={confidenceBand.explanation}
            >
              <span aria-hidden>●</span>
              <span>
                Confidence{" "}
                <span className="font-mono">{confidencePct}%</span>
              </span>
              <span className="text-fg-faint">({confidenceBand.label})</span>
              {recommendation.plan.confidence_capped ? (
                <span
                  className="ml-1 rounded bg-bg-elevated px-1 py-0 font-mono text-[10px] text-fg-muted"
                  title="The LLM's raw score was clamped down to the per-category ceiling defined by the remediator's risk policy. See blackglass-remediator/app/agent/risk_policy.py → CATEGORY_CONFIDENCE_CAP."
                >
                  capped
                </span>
              ) : null}
            </span>
          ) : null}
          <Badge tone={statusTone(recommendation.status)}>{statusLabel(recommendation.status)}</Badge>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-fg-primary">{recommendation.summary}</p>

      <div className="flex flex-wrap gap-2 text-[11px] text-fg-faint">
        <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono">
          tier: {recommendation.riskPolicyTier}
        </span>
        {recommendation.plan.requires_human_approval ? (
          <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono">human-approval-required</span>
        ) : null}
      </div>

      {commands.length > 0 && (
        <details className="rounded border border-border-subtle bg-bg-elevated px-3 py-2 text-xs">
          <summary className="cursor-pointer text-fg-muted">
            Proposed commands ({commands.length})
          </summary>
          <ul className="mt-2 space-y-2 font-mono text-[11px] text-fg-primary">
            {commands.map((cmd, i) => (
              <li key={i} className="border-l-2 border-border-default pl-2">
                <p>{cmd.command ?? "(no command)"}</p>
                {cmd.purpose ? (
                  <p className="mt-1 font-sans text-fg-faint">{cmd.purpose}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {recommendation.status === "approved" && recommendation.approvedAt ? (
        <p className="text-[11px] text-fg-faint">
          Approved {new Date(recommendation.approvedAt).toLocaleString("en-GB")}{" "}
          {recommendation.approvedBy ? `by ${recommendation.approvedBy}` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="primary"
          disabled={decisionDisabled || pending === "approve"}
          onClick={() => decide("approve")}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          variant="secondary"
          disabled={decisionDisabled || pending === "reject"}
          onClick={() => decide("reject")}
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </section>
  );
}
