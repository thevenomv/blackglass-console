/**
 * Contextual risk scorer for drift findings.
 *
 * Scoring model:
 *   - Base severity score:  critical=9, high=7, medium=4, low=2
 *   - Category multiplier:  each category carries a risk weight
 *   - Lifecycle discount:   accepted/remediated findings score lower
 *
 * The scorer also produces:
 *   - A 1-10 composite risk score
 *   - A priority label: "critical" | "high" | "medium" | "low"
 *   - An actionable next-step recommendation
 *
 * Usage:
 *   import { scoreEvent, scoreEvents, hostRiskSummary } from "@/lib/server/risk-score";
 */

import type { DriftEvent, DriftCategory, DriftSeverity, FindingLifecycle } from "@/data/mock/types";

// ---------------------------------------------------------------------------
// Scoring tables
// ---------------------------------------------------------------------------

const SEVERITY_BASE: Record<DriftSeverity | "critical", number> = {
  critical: 9,
  high: 7,
  medium: 4,
  low: 2,
};

/**
 * Category risk weight (0-2 multiplier applied on top of severity base).
 * Categories that represent direct attack vectors or persistence mechanisms
 * carry the highest weight.
 */
const CATEGORY_WEIGHT: Record<DriftCategory | string, number> = {
  persistence:            2.0,  // backdoors, cron jobs
  privilege_escalation:   1.9,  // sudo / setuid changes
  identity:               1.8,  // user / key changes
  network_exposure:       1.7,  // unexpected listeners / FW holes
  ssh:                    1.6,  // SSH config weakening
  integrity:              1.5,  // file/config tampering
  firewall:               1.4,  // firewall rule changes
  packages:               1.1,  // package installs/upgrades
};

/**
 * Lifecycle discount factor — remediated/verified findings score much lower
 * so the risk roll-up reflects actual exposure, not historical noise.
 */
const LIFECYCLE_FACTOR: Record<FindingLifecycle | string, number> = {
  new:            1.0,
  triaged:        0.85,
  accepted_risk:  0.5,
  remediated:     0.2,
  verified:       0.1,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskPriority = "critical" | "high" | "medium" | "low";

export type EventRiskScore = {
  /** 1-10 composite risk score (higher = riskier). */
  score: number;
  priority: RiskPriority;
  /** One-line recommended next action. */
  recommendation: string;
};

export type HostRiskSummary = {
  /** Highest single-event score for this host. */
  maxScore: number;
  /** Mean score across all active (non-remediated) events. */
  meanScore: number;
  /** Count by priority bucket. */
  countByCriticality: Record<RiskPriority, number>;
  /** Overall host risk priority driven by maxScore. */
  hostPriority: RiskPriority;
};

// ---------------------------------------------------------------------------
// Recommendation matrix
// ---------------------------------------------------------------------------

const RECOMMENDATIONS: Record<DriftCategory | string, Record<DriftSeverity | "critical", string>> = {
  persistence: {
    critical: "Immediately isolate host and investigate the persistence mechanism.",
    high:     "Audit all cron jobs, systemd units, and init scripts for unauthorized entries.",
    medium:   "Review new scheduled tasks and ensure they are authorized.",
    low:      "Log and acknowledge new scheduled tasks for the audit trail.",
  },
  privilege_escalation: {
    critical: "Lock down SUID/SGID binaries and audit sudo rules immediately.",
    high:     "Review sudoers configuration and remove overly permissive rules.",
    medium:   "Verify sudo grants against least-privilege policy.",
    low:      "Document the privilege change and confirm it was intentional.",
  },
  identity: {
    critical: "Revoke unauthorized credentials and perform a full access review.",
    high:     "Audit new user accounts and SSH authorized_keys for unauthorized access.",
    medium:   "Verify account changes against a change management record.",
    low:      "Document the identity change and confirm it aligns with onboarding.",
  },
  network_exposure: {
    critical: "Block unexpected port immediately; investigate the listening process.",
    high:     "Identify and terminate the unexpected listener; review firewall rules.",
    medium:   "Confirm the service is authorized; add it to the approved port inventory.",
    low:      "Log the new listener and ensure it appears in the next baseline.",
  },
  ssh: {
    critical: "Revert SSH configuration to hardened baseline and rotate host keys.",
    high:     "Enforce CIS benchmark SSH settings and audit existing sessions.",
    medium:   "Review SSH config change against hardening policy.",
    low:      "Confirm the SSH config change was intentional and document it.",
  },
  integrity: {
    critical: "File tampering detected — isolate host and investigate for compromise.",
    high:     "Restore the affected file from a known-good backup and audit access logs.",
    medium:   "Verify the change was intentional and re-capture baseline if approved.",
    low:      "Review the file change and capture a new baseline once confirmed safe.",
  },
  firewall: {
    critical: "Firewall bypass detected — re-apply firewall policy immediately.",
    high:     "Restore firewall rules to approved policy; audit recent changes.",
    medium:   "Confirm the rule change was authorized and document the rationale.",
    low:      "Log the rule change and update change management records.",
  },
  packages: {
    critical: "Unapproved package with known CVEs detected — remove or patch immediately.",
    high:     "Verify newly installed packages against the approved software inventory.",
    medium:   "Confirm package updates were performed within the maintenance window.",
    low:      "Log the package change and ensure it is captured in the next baseline.",
  },
};

function getRecommendation(category: string, severity: string): string {
  const cat = RECOMMENDATIONS[category] ?? RECOMMENDATIONS.integrity;
  return (
    cat[severity as DriftSeverity | "critical"] ??
    "Investigate this finding and update the baseline once the change is confirmed safe."
  );
}

function priorityFromScore(score: number): RiskPriority {
  if (score >= 8) return "critical";
  if (score >= 6) return "high";
  if (score >= 3.5) return "medium";
  return "low";
}

/** Public helper for deriving a priority label from any 1-10 score. */
export function riskPriorityFromScore(score: number): RiskPriority {
  return priorityFromScore(score);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a single drift event in isolation.
 */
export function scoreEvent(event: DriftEvent): EventRiskScore {
  const base = SEVERITY_BASE[event.severity] ?? SEVERITY_BASE.low;
  const catWeight = CATEGORY_WEIGHT[event.category] ?? 1.0;
  const lcFactor = LIFECYCLE_FACTOR[event.lifecycle] ?? 1.0;

  const raw = base * catWeight * lcFactor;
  // Clamp to 1-10
  const score = Math.min(10, Math.max(1, Math.round(raw * 10) / 10));
  const priority = priorityFromScore(score);
  const recommendation = getRecommendation(event.category, event.severity);

  return { score, priority, recommendation };
}

/**
 * Score an array of events and return them annotated with risk data.
 */
export function scoreEvents(
  events: DriftEvent[],
): Array<DriftEvent & { risk: EventRiskScore }> {
  return events.map((e) => ({ ...e, risk: scoreEvent(e) }));
}

/**
 * Produce a host-level risk summary from all events for that host.
 */
export function hostRiskSummary(events: DriftEvent[]): HostRiskSummary {
  if (events.length === 0) {
    return {
      maxScore: 0,
      meanScore: 0,
      countByCriticality: { critical: 0, high: 0, medium: 0, low: 0 },
      hostPriority: "low",
    };
  }

  const scores = events.map(scoreEvent);
  const maxScore = Math.max(...scores.map((s) => s.score));
  const meanScore = Math.round((scores.reduce((a, s) => a + s.score, 0) / scores.length) * 10) / 10;

  const countByCriticality: Record<RiskPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const s of scores) countByCriticality[s.priority]++;

  return {
    maxScore,
    meanScore,
    countByCriticality,
    hostPriority: priorityFromScore(maxScore),
  };
}

/**
 * Compute the overall fleet risk score from all drift events across all hosts.
 * Returns a 1-10 number suitable for a dashboard KPI widget.
 */
export function fleetRiskScore(events: DriftEvent[]): number {
  if (events.length === 0) return 0;
  const active = events.filter(
    (e) => e.lifecycle !== "remediated" && e.lifecycle !== "verified",
  );
  if (active.length === 0) return 0;
  const scores = active.map((e) => scoreEvent(e).score);
  // Use weighted-max: 70% max + 30% mean to reflect both worst case and overall pressure
  const max = Math.max(...scores);
  const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
  return Math.min(10, Math.round((max * 0.7 + mean * 0.3) * 10) / 10);
}
