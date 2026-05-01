/** Shared mock entity types — mirror future API shapes. */

export type HostTrust = "aligned" | "drift" | "needs_review" | "critical";

export type HostRecord = {
  id: string;
  hostname: string;
  os: string;
  trust: HostTrust;
  lastScanAt: string;
  baselineAligned: boolean;
  readinessScore: number;
};

export type DriftSeverity = "high" | "medium" | "low";

/** Workflow stage for a drift finding (mock mirrors future PUT /drift/:id transitions). */
export type FindingLifecycle =
  | "new"
  | "triaged"
  | "accepted_risk"
  | "remediated"
  | "verified";

export type DriftCategory =
  | "network_exposure"
  | "identity"
  | "persistence"
  | "ssh"
  | "firewall"
  | "packages";

export type DriftProvenance = {
  collector: string;
  confidenceLabel: string;
  modelVersion?: string;
  verifiedAt?: string;
};

export type DriftEvent = {
  id: string;
  hostId: string;
  category: DriftCategory;
  severity: DriftSeverity;
  lifecycle: FindingLifecycle;
  title: string;
  detectedAt: string;
  rationale: string;
  evidenceSummary: string;
  suggestedActions: string[];
  provenance?: DriftProvenance;
};

/** Collector heartbeat and stale telemetry slices (fleet-wide). */
export type FleetCoverage = {
  collectorsExpected: number;
  collectorsOnline: number;
  lastFleetHeartbeatAt: string;
  staleSlices: { hostId: string; slice: string; staleSince: string }[];
};

export type FleetSnapshot = {
  hostsChecked: number;
  highRiskDrift: number;
  readyHosts: number;
  evidenceBundles: number;
  driftVolumeByDay: { day: string; valuePct: number }[];
  fleetBullets: string[];
  notableEvents: { hostId: string; slug: string; label: string }[];
  coverage: FleetCoverage;
};

export type HostPort = {
  proto: string;
  bind: string;
  port: number;
  process?: string;
  baselineMatch: boolean;
};

export type HostUserRow = {
  user: string;
  uid: number;
  groups: string[];
  sudoCapable: boolean;
  baselineMatch: boolean;
};

export type HostServiceRow = {
  unit: string;
  state: string;
  enabled: boolean;
  baselineMatch: boolean;
};

export type HostSSHFirewall = {
  sshPermitRoot: string;
  sshPasswordAuth: boolean;
  baselineMatchSsh: boolean;
  firewallBackend: string;
  defaultPolicy: string;
  baselineMatchFw: boolean;
};

export type TimelineEntry = {
  at: string;
  label: string;
  detail: string;
  severity?: DriftSeverity;
};

export type HostDetail = HostRecord & {
  baselineId: string;
  baselineLabel: string;
  integrityBars: {
    networkListenersInvestigation: number;
    userGroupDrift: number;
    systemdPersistence: number;
    evidenceCompleteness: number;
  };
  deltaCounts: Record<string, number>;
  ports: HostPort[];
  users: HostUserRow[];
  services: HostServiceRow[];
  sshFirewall: HostSSHFirewall;
  timeline: TimelineEntry[];
};

export type BaselineSnapshotMeta = {
  id: string;
  label: string;
  hostId: string;
  pinnedAt: string;
  scanId: string;
  superseded: boolean;
};

export type DiffChangeType = "added" | "removed" | "changed";

export type BaselineDiffRow = {
  path: string;
  change: DiffChangeType;
  severity: DriftSeverity;
  summary: string;
  before?: string;
  after?: string;
  /** Optional rule id from drift engine / policy pack (structured diff metadata). */
  ruleId?: string;
  beforeSha256?: string;
  afterSha256?: string;
};

export type BaselineDiffCategory = {
  id: string;
  label: string;
  rows: BaselineDiffRow[];
};

export type ReportRecord = {
  id: string;
  title: string;
  scope: string;
  generatedAt: string;
  status: "ready" | "generating" | "failed";
  format: "markdown" | "pdf";
};
