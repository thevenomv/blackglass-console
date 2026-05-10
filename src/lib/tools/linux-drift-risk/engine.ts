/**
 * Free Linux Drift Risk Score — pure, browser-safe scoring engine.
 *
 * Same pattern as the Cloud Waste Estimator: a deliberately approximate
 * pre-scan planning tool aligned with the Blackglass mental model. Takes a
 * five-question multiple-choice questionnaire and returns a 0–100 risk
 * score plus the three drift classes most worth watching for that posture.
 *
 * Design boundaries
 * -----------------
 * The weights here are calibrated for directional usefulness, not
 * production-grade classification. They are not the heuristics Blackglass
 * uses to flag actual drift events on a real fleet. The score is meant to
 * answer "is investing in continuous drift detection a high-value bet for
 * a fleet that looks like mine?" — not "what is the exact risk level of
 * host-07."
 *
 * Inputs are intentionally multiple-choice with no free text — we never
 * collect distros by name, hostnames, or operator commentary.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DistroFamily = "deb" | "rhel" | "amzn" | "suse" | "alpine" | "other";

export const DISTRO_LABELS: Record<DistroFamily, string> = {
  deb: "Debian / Ubuntu",
  rhel: "RHEL / Rocky / Alma / CentOS Stream",
  amzn: "Amazon Linux",
  suse: "SUSE / openSUSE",
  alpine: "Alpine",
  other: "Other / mixed",
};

export type ConfigMgmt = "consistent" | "occasional" | "none";

export const CONFIG_MGMT_LABELS: Record<ConfigMgmt, string> = {
  consistent: "Consistent (Ansible / Puppet / Chef / Salt run on a schedule)",
  occasional: "Occasional (used for setup, drift creeps in over time)",
  none: "None (manual SSH and shell scripts only)",
};

export type SshKeyProcess = "automated" | "documented" | "ad-hoc";

export const SSH_KEY_PROCESS_LABELS: Record<SshKeyProcess, string> = {
  automated: "Automated (issued and revoked via IdP / Vault / Teleport)",
  documented: "Documented (manual but a runbook exists and is followed)",
  "ad-hoc": "Ad-hoc (added on request, rarely removed)",
};

export type CompliancePressure = "high" | "moderate" | "low";

export const COMPLIANCE_LABELS: Record<CompliancePressure, string> = {
  high: "High (SOC 2 / ISO 27001 / PCI / FedRAMP / CMMC due in <12 months)",
  moderate: "Moderate (internal change-control or customer security questionnaires)",
  low: "Low (no formal obligations today)",
};

export type ExistingTelemetry =
  | "comprehensive"
  | "partial"
  | "none";

export const TELEMETRY_LABELS: Record<ExistingTelemetry, string> = {
  comprehensive: "Comprehensive (osquery / auditd / FIM / CSPM all in place)",
  partial: "Partial (one or two of those, gaps you know about)",
  none: "None (logs only, no host-state telemetry)",
};

export interface DriftRiskInput {
  /** Distro families in production. Multi-select; mixed fleets get a small uplift. */
  distros: DistroFamily[];
  configMgmt: ConfigMgmt;
  sshKeys: SshKeyProcess;
  compliance: CompliancePressure;
  telemetry: ExistingTelemetry;
}

export type RiskBand = "low" | "medium" | "high" | "critical";

export type DriftClassId = "ssh" | "privilege" | "package" | "network" | "persistence";

export interface DriftClass {
  id: DriftClassId;
  label: string;
  why: string;
}

export interface DriftRiskResult {
  /** 0–100, higher = more drift risk. */
  score: number;
  band: RiskBand;
  /** The three classes ranked highest for this posture. */
  topClasses: DriftClass[];
  /** Per-input contribution explanation (transparent maths). */
  contributions: { label: string; points: number }[];
  /** Plain-language recommendations — never reveals exact thresholds. */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Drift class catalogue
// ---------------------------------------------------------------------------

const ALL_CLASSES: Record<DriftClassId, DriftClass> = {
  ssh: {
    id: "ssh",
    label: "SSH keys & remote access",
    why: "Drift here turns into long-lived backdoors and post-departure access risk.",
  },
  privilege: {
    id: "privilege",
    label: "sudoers / privilege model",
    why: "Quiet promotion of a daemon user to wheel is one of the highest-impact, lowest-noise drift events.",
  },
  package: {
    id: "package",
    label: "Package baseline",
    why: "Unscheduled installs and version skew break reproducibility and let CVEs slip through.",
  },
  network: {
    id: "network",
    label: "Network listeners & firewall",
    why: "New listening ports without a change ticket are a classic post-compromise persistence signal.",
  },
  persistence: {
    id: "persistence",
    label: "Systemd units & cron",
    why: "Silent unit installs and cron edits are how attackers and forgotten side projects keep coming back.",
  },
};

// ---------------------------------------------------------------------------
// Scoring weights — directional, not Blackglass's real engine
// ---------------------------------------------------------------------------

const WEIGHTS = {
  configMgmt: { consistent: 0, occasional: 12, none: 22 },
  sshKeys: { automated: 0, documented: 10, "ad-hoc": 22 },
  compliance: { low: 0, moderate: 8, high: 16 },
  telemetry: { comprehensive: 0, partial: 10, none: 18 },
  /** Mixed-distro fleets get a small uplift — different policy bases. */
  mixedDistroUplift: 8,
  /** Each additional distro family beyond two adds a smaller uplift. */
  perExtraDistro: 3,
  /** Cap applied to the sum before band classification. */
  maxScore: 100,
} as const;

// ---------------------------------------------------------------------------
// Banding
// ---------------------------------------------------------------------------

export const RISK_BAND_THRESHOLDS = {
  /** ≤ this is "low". */
  lowMaxScore: 20,
  /** ≤ this is "medium". */
  mediumMaxScore: 50,
  /** ≤ this is "high"; anything above is "critical". */
  highMaxScore: 75,
} as const;

export function classifyDriftRiskBand(score: number): RiskBand {
  if (!Number.isFinite(score) || score <= RISK_BAND_THRESHOLDS.lowMaxScore) return "low";
  if (score <= RISK_BAND_THRESHOLDS.mediumMaxScore) return "medium";
  if (score <= RISK_BAND_THRESHOLDS.highMaxScore) return "high";
  return "critical";
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function distroContribution(distros: DistroFamily[]): number {
  const unique = Array.from(new Set(distros)).filter((d) => d in DISTRO_LABELS);
  if (unique.length <= 1) return 0;
  const base = WEIGHTS.mixedDistroUplift;
  const extras = Math.max(0, unique.length - 2);
  return base + extras * WEIGHTS.perExtraDistro;
}

/**
 * Pick the three drift classes most worth watching for this posture.
 * Order matters: the first item is the single biggest risk vector.
 *
 * The class-priority logic stays simple and explainable:
 *   - SSH process is the strongest single signal — weak processes always
 *     surface "ssh" first.
 *   - High compliance pressure raises "privilege" (sudoers is what auditors
 *     ask about most) and "persistence" (systemd unit changes are a SOC
 *     audit favourite).
 *   - No config management raises "package" (drift accumulates fast).
 *   - Otherwise we fall back to the broad-fleet defaults: SSH, privilege,
 *     package — the trio Blackglass surfaces in product copy.
 */
function pickTopClasses(input: DriftRiskInput): DriftClass[] {
  const ranked: DriftClassId[] = [];
  const push = (id: DriftClassId) => {
    if (!ranked.includes(id)) ranked.push(id);
  };

  if (input.sshKeys === "ad-hoc") push("ssh");
  if (input.configMgmt === "none") {
    push("package");
    push("persistence");
  }
  if (input.compliance === "high") {
    push("privilege");
    push("persistence");
  }
  if (input.telemetry === "none") push("network");

  // Fall through to the canonical Blackglass trio.
  push("ssh");
  push("privilege");
  push("package");

  return ranked.slice(0, 3).map((id) => ALL_CLASSES[id]);
}

function buildRecommendations(input: DriftRiskInput, band: RiskBand): string[] {
  const recs: string[] = [];

  if (input.sshKeys !== "automated") {
    recs.push(
      "Tighten the SSH key lifecycle — at minimum, agree a removal trigger when someone leaves the team.",
    );
  }
  if (input.configMgmt === "none") {
    recs.push(
      "Pick one configuration-management tool and apply it to a single environment as a starter — it's the highest-leverage change you can make.",
    );
  }
  if (input.telemetry === "none") {
    recs.push(
      "Capture a baseline of host state before chasing real-time telemetry — drift detection is much cheaper than full audit log streaming.",
    );
  }
  if (input.compliance === "high") {
    recs.push(
      "Map each drift class to your control catalogue (SOC 2 CC6 / ISO 27001 A.12.5, etc.) so audit responses write themselves.",
    );
  }
  if (band === "critical" || band === "high") {
    recs.push(
      "Plan a fortnightly drift review for the first three months — it's enough cadence to spot patterns without becoming a chore.",
    );
  } else {
    recs.push(
      "Schedule a quarterly drift review and an annual baseline refresh — small fleets stay healthy on light cadence.",
    );
  }
  return recs;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export function scoreLinuxDriftRisk(input: DriftRiskInput): DriftRiskResult {
  const contributions: { label: string; points: number }[] = [];
  let total = 0;

  const cm = WEIGHTS.configMgmt[input.configMgmt] ?? 0;
  total += cm;
  contributions.push({ label: `Configuration management — ${CONFIG_MGMT_LABELS[input.configMgmt]}`, points: cm });

  const ssh = WEIGHTS.sshKeys[input.sshKeys] ?? 0;
  total += ssh;
  contributions.push({ label: `SSH key process — ${SSH_KEY_PROCESS_LABELS[input.sshKeys]}`, points: ssh });

  const comp = WEIGHTS.compliance[input.compliance] ?? 0;
  total += comp;
  contributions.push({ label: `Compliance pressure — ${COMPLIANCE_LABELS[input.compliance]}`, points: comp });

  const tel = WEIGHTS.telemetry[input.telemetry] ?? 0;
  total += tel;
  contributions.push({ label: `Existing telemetry — ${TELEMETRY_LABELS[input.telemetry]}`, points: tel });

  const distroPts = distroContribution(input.distros);
  if (distroPts > 0) {
    total += distroPts;
    contributions.push({ label: `Mixed-distro uplift (${input.distros.length} families)`, points: distroPts });
  }

  const score = Math.min(WEIGHTS.maxScore, Math.max(0, Math.round(total)));
  const band = classifyDriftRiskBand(score);

  return {
    score,
    band,
    topClasses: pickTopClasses(input),
    contributions,
    recommendations: buildRecommendations(input, band),
  };
}

/** Convenience — empty / safe default input for the form. */
export function emptyDriftRiskInput(): DriftRiskInput {
  return {
    distros: [],
    configMgmt: "consistent",
    sshKeys: "automated",
    compliance: "low",
    telemetry: "comprehensive",
  };
}
