import type { FleetSnapshot, HostDetail, HostPort, HostRecord, HostServiceRow, HostSSHFirewall, HostTrust, HostUserRow, TimelineEntry } from "@/data/mock/types";
import { fleetSnapshot } from "@/data/mock/fleet";
import { hosts } from "@/data/mock/hosts";
import { apiConfig } from "@/lib/api/config";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured, configuredHostCount } from "./collector";
import { getDriftEvents, hasDriftData } from "./drift-engine";
import { getBaseline, listBaselineHostIds } from "./baseline-store";
import { getDriftVolumeChartFromHistory } from "./drift-history";
import { evidenceBundleCatalogSize } from "./evidence-catalog";

/** Fleet KPIs when no collector is configured — neutral empty shell. */
export function emptyFleetSnapshot(): FleetSnapshot {
  const expected = collectorConfigured() ? configuredHostCount() : 0;
  return {
    hostsChecked: 0,
    highRiskDrift: 0,
    readyHosts: 0,
    evidenceBundles: evidenceBundleCatalogSize(),
    driftVolumeByDay: [],
    fleetBullets: [
      collectorConfigured()
        ? "Capture a baseline to start monitoring — see Baselines."
        : "Configure COLLECTOR_HOST_1 and SSH credentials in Settings, then capture a baseline.",
    ],
    notableEvents: [],
    coverage: {
      collectorsExpected: expected,
      collectorsOnline: 0,
      lastFleetHeartbeatAt: new Date().toISOString(),
      staleSlices: [],
    },
  };
}

/** Single source for inventory — API routes and SSR can share this. */
export async function loadHosts(): Promise<HostRecord[]> {
  if (apiConfig.useMock && !collectorConfigured()) {
    await mockLatency(40);
    return hosts;
  }
  if (!collectorConfigured()) {
    await mockLatency(40);
    return [];
  }
  return buildRealHosts();
}

export async function loadFleetSnapshot(): Promise<FleetSnapshot> {
  if (apiConfig.useMock && !collectorConfigured()) {
    await mockLatency(40);
    return fleetSnapshot;
  }
  if (!collectorConfigured()) {
    await mockLatency(40);
    return emptyFleetSnapshot();
  }
  return buildRealFleetSnapshot();
}

// ---------------------------------------------------------------------------
// Real-data builders — only called when collector env vars are set
// ---------------------------------------------------------------------------

/** Per-high-severity drift event: subtract this many readiness points. */
const READINESS_PENALTY_HIGH = 15;
/** Per non-high drift event: subtract this many readiness points. */
const READINESS_PENALTY_ANY = 5;
/** Minimum high-severity events to classify host as "critical". */
const TRUST_CRITICAL_THRESHOLD = 2;

async function buildRealHosts(): Promise<HostRecord[]> {
  const baselineIds = new Set(await listBaselineHostIds());
  if (baselineIds.size === 0) return [];

  return Promise.all(
    [...baselineIds].map(async (hostId) => {
      const events = getDriftEvents(hostId);
      const high = events.filter((e) => e.severity === "high" && e.lifecycle === "new").length;
      const any = events.filter((e) => e.lifecycle === "new").length;

      let trust: HostTrust = "aligned";
      if (high >= TRUST_CRITICAL_THRESHOLD) trust = "critical";
      else if (high >= 1) trust = "drift";
      else if (any > 0) trust = "needs_review";

      const score = Math.max(0, 100 - high * READINESS_PENALTY_HIGH - (any - high) * READINESS_PENALTY_ANY);
      const baseline = await getBaseline(hostId);

      return {
        id: hostId,
        hostname: baseline?.hostname ?? hostId,
        os: "Linux",
        trust,
        lastScanAt: new Date().toISOString(),
        baselineAligned: trust === "aligned",
        readinessScore: score,
      };
    }),
  );
}

async function buildRealFleetSnapshot(): Promise<FleetSnapshot> {
  const baselineIds = await listBaselineHostIds();
  const allEvents = getDriftEvents();
  const hasData = hasDriftData();

  const highRisk = allEvents.filter(
    (e) => e.severity === "high" && e.lifecycle === "new",
  ).length;
  const expectedCollectors = configuredHostCount();
  const readyHosts = baselineIds.filter(
    (id) =>
      !allEvents.some(
        (e) => e.hostId === id && e.severity === "high" && e.lifecycle === "new",
      ),
  ).length;
  const monitoringHostCount = baselineIds.length;
  const monitoringBullet =
    monitoringHostCount === 0
      ? "No baselines captured yet"
      : `${monitoringHostCount} host${monitoringHostCount !== 1 ? "s" : ""} under active monitoring`;

  const notableEvents = allEvents.slice(0, 5).map((e) => ({
    hostId: e.hostId,
    slug: e.category,
    label: e.title,
  }));

  const driftVolumeByDay = await getDriftVolumeChartFromHistory();

  return {
    hostsChecked: baselineIds.length,
    highRiskDrift: highRisk,
    readyHosts,
    evidenceBundles: evidenceBundleCatalogSize(),
    driftVolumeByDay,
    fleetBullets: hasData
      ? [
          `${allEvents.length} drift signal${allEvents.length !== 1 ? "s" : ""} detected`,
          `${highRisk} high-severity finding${highRisk !== 1 ? "s" : ""}`,
          monitoringBullet,
        ]
      : ["Baseline captured — run a scan to detect drift"],
    notableEvents,
    coverage: {
      collectorsExpected: expectedCollectors,
      collectorsOnline: baselineIds.length,
      lastFleetHeartbeatAt: new Date().toISOString(),
      staleSlices: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Host detail — live data path
// ---------------------------------------------------------------------------

const CATEGORY_LABEL_MAP: Record<string, string> = {
  network_exposure: "Network exposure",
  identity: "Identity / privilege",
  persistence: "Systemd persistence",
  ssh: "SSH posture",
  firewall: "Firewall",
  packages: "Packages / kernel",
};

/**
 * Returns a fully-populated HostDetail from the real collector/baseline store
 * when `collectorConfigured()` is true and a baseline exists for `id`.
 * Returns null otherwise (caller falls back to mock data).
 */
export async function loadHostDetail(id: string): Promise<HostDetail | null> {
  if (!collectorConfigured()) return null;

  const hosts = await buildRealHosts();
  const record = hosts.find((h) => h.id === id);
  if (!record) return null;

  const baseline = await getBaseline(id);
  if (!baseline) return null;

  const events = getDriftEvents(id);
  const newEvents = events.filter((e) => e.lifecycle === "new");

  // --- Ports ---
  const baselinePorts = new Set(baseline.listeners.map((l) => `${l.proto}:${l.port}`));
  const ports: HostPort[] = baseline.listeners.map((l) => ({
    proto: l.proto,
    bind: l.bind,
    port: l.port,
    process: l.process,
    baselineMatch: baselinePorts.has(`${l.proto}:${l.port}`),
  }));

  // --- Users ---
  const sudoers = new Set(baseline.sudoers);
  const baselineUsernames = new Set(baseline.users.map((u) => u.username));
  const users: HostUserRow[] = baseline.users.map((u) => ({
    user: u.username,
    uid: u.uid,
    groups: sudoers.has(u.username) ? ["sudo"] : [],
    sudoCapable: sudoers.has(u.username),
    baselineMatch: baselineUsernames.has(u.username),
  }));

  // --- Services ---
  const baselineSvcs = new Set(baseline.services.map((s) => s.unit));
  const services: HostServiceRow[] = baseline.services.map((s) => ({
    unit: s.unit,
    state: s.sub,
    enabled: true,
    baselineMatch: baselineSvcs.has(s.unit),
  }));

  // --- SSH / Firewall ---
  const sshFirewall: HostSSHFirewall = {
    sshPermitRoot: baseline.ssh.permitRootLogin,
    sshPasswordAuth: baseline.ssh.passwordAuthentication.toLowerCase() === "yes",
    baselineMatchSsh: true,
    firewallBackend: baseline.firewall.active ? "ufw" : "none",
    defaultPolicy: baseline.firewall.defaultInbound,
    baselineMatchFw: true,
  };

  // --- Delta counts by UI label ---
  const deltaCounts: Record<string, number> = Object.fromEntries(
    Object.values(CATEGORY_LABEL_MAP).map((label) => [label, 0]),
  );
  for (const e of newEvents) {
    const label = CATEGORY_LABEL_MAP[e.category] ?? e.category;
    deltaCounts[label] = (deltaCounts[label] ?? 0) + 1;
  }

  // --- Integrity bars (derived from drift severity) ---
  const portDrift = newEvents.filter((e) => e.category === "network_exposure").length;
  const userDrift = newEvents.filter((e) => e.category === "identity").length;
  const svcDrift = newEvents.filter((e) => e.category === "persistence").length;
  const highNew = newEvents.filter((e) => e.severity === "high").length;
  const integrityBars = {
    networkListenersInvestigation: Math.max(0, 100 - portDrift * 20),
    userGroupDrift: Math.max(0, 100 - userDrift * 20),
    systemdPersistence: Math.max(0, 100 - svcDrift * 25),
    evidenceCompleteness: newEvents.length === 0 ? 100 : Math.max(20, 100 - highNew * 15),
  };

  // --- Timeline ---
  const timeline: TimelineEntry[] = [
    ...newEvents.slice(0, 10).map((e) => ({
      at: e.detectedAt,
      label: e.title,
      detail: e.rationale.slice(0, 120),
      severity: e.severity,
    })),
    {
      at: baseline.collectedAt,
      label: "Baseline captured",
      detail: `${baseline.listeners.length} listeners · ${baseline.users.length} users · ${baseline.services.length} services`,
    },
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    ...record,
    baselineId: `bl-${id}`,
    baselineLabel: `live-${baseline.collectedAt.slice(0, 10)}`,
    integrityBars,
    deltaCounts,
    ports,
    users,
    services,
    sshFirewall,
    timeline,
  };
}
