"use client";

/**
 * ComplianceScoreTile — derived 0-100 fleet posture metric.
 *
 * Buyers and CISOs asked for "one number to put in the board deck"
 * (see review feedback Wave 10). We don't have a real compliance
 * engine yet — this score is intentionally a transparent heuristic
 * so the dashboard isn't blocked on building one. The breakdown
 * underneath the number is shown so reviewers see exactly how it's
 * computed: this is a posture indicator, not an audit-grade
 * attestation.
 *
 * Formula:
 *   readyRatio       = readyHosts / max(hostsChecked, 1)            // 0..1
 *   highRiskPenalty  = min(highRiskDrift * 5, 40)                    // 0..40 points
 *   score            = round(readyRatio * 100 - highRiskPenalty)
 *   score            = clamp(score, 0, 100)
 *
 * Mapping (also surfaced in the tile, so it's auditable):
 *   90-100 = "Aligned"
 *   70-89  = "Minor drift"
 *   40-69  = "Action needed"
 *   0-39   = "Critical"
 *
 * Once we have a richer model (CIS pass/fail counts, mute coverage
 * weighted by category), this component can be swapped server-side
 * without changing the dashboard layout.
 */

interface Props {
  hostsChecked: number;
  highRiskDrift: number;
  readyHosts: number;
}

function tone(score: number): {
  label: string;
  cardClass: string;
  textClass: string;
  badgeClass: string;
} {
  if (score >= 90)
    return {
      label: "Aligned",
      cardClass: "border-success/40 bg-success-soft/20",
      textClass: "text-success",
      badgeClass: "bg-success-soft text-success",
    };
  if (score >= 70)
    return {
      label: "Minor drift",
      cardClass: "border-accent-blue/40 bg-accent-blue-soft/20",
      textClass: "text-accent-blue",
      badgeClass: "bg-accent-blue-soft text-accent-blue",
    };
  if (score >= 40)
    return {
      label: "Action needed",
      cardClass: "border-warning/40 bg-warning-soft/25",
      textClass: "text-warning",
      badgeClass: "bg-warning-soft text-warning",
    };
  return {
    label: "Critical",
    cardClass: "border-danger/50 bg-danger-soft/25",
    textClass: "text-danger",
    badgeClass: "bg-danger-soft text-danger",
  };
}

export function ComplianceScoreTile({
  hostsChecked,
  highRiskDrift,
  readyHosts,
}: Props) {
  // Defensive math — empty fleets show "—" rather than 0% which would
  // misleadingly flash "Critical".
  if (hostsChecked === 0) {
    return (
      <section
        aria-label="Compliance posture"
        className="rounded-card border border-border-subtle bg-bg-elevated p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-fg-faint">
              Compliance posture
            </p>
            <p className="mt-2 font-mono text-3xl font-semibold text-fg-muted">—</p>
            <p className="mt-1 text-xs text-fg-faint">No telemetry yet — connect a host to see your score.</p>
          </div>
        </div>
      </section>
    );
  }

  const readyRatio = readyHosts / Math.max(hostsChecked, 1);
  const highRiskPenalty = Math.min(highRiskDrift * 5, 40);
  const rawScore = Math.round(readyRatio * 100 - highRiskPenalty);
  const score = Math.max(0, Math.min(100, rawScore));
  const t = tone(score);

  return (
    <section
      aria-label="Compliance posture"
      className={`flex flex-col gap-4 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between ${t.cardClass}`}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-fg-faint">
          Compliance posture
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <p className={`font-mono text-4xl font-semibold ${t.textClass}`}>
            {score}
            <span className="ml-1 text-base text-fg-muted">/ 100</span>
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.badgeClass}`}
          >
            {t.label}
          </span>
        </div>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-fg-muted">
          Heuristic: <span className="font-mono">{Math.round(readyRatio * 100)}%</span> ready hosts
          minus <span className="font-mono">{highRiskPenalty}pt</span> for {highRiskDrift} high-risk
          drift signal{highRiskDrift === 1 ? "" : "s"}. Posture indicator — not an audit attestation.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs sm:max-w-[280px]">
        <Stat label="Ready" value={readyHosts} />
        <Stat label="Checked" value={hostsChecked} />
        <Stat label="High-risk" value={highRiskDrift} accent={highRiskDrift > 0 ? "danger" : "muted"} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "muted",
}: {
  label: string;
  value: number;
  accent?: "muted" | "danger";
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-panel px-2 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 font-mono text-lg ${accent === "danger" ? "text-danger" : "text-fg-primary"}`}>
        {value}
      </p>
    </div>
  );
}
