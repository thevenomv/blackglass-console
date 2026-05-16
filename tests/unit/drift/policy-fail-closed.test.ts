/**
 * Tests for the "policy evaluation fail-closed" behaviour.
 *
 * Compliance products MUST fail closed: if the policy engine cannot
 * load a tenant's rules for a host, the previous behaviour (catch +
 * log + return []) silently dropped the entire compliance signal so
 * the dashboard would show zero violations for an unverified host.
 *
 * `processHostSnapshotDrift` should now emit a synthetic
 * `policy_failure` DriftEvent (high severity, lifecycle "new") so the
 * operator sees an explicit "Policy evaluation failed" finding and the
 * dashboard SystemStatusBanner can surface it.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { DriftEvent } from "@/data/mock/types";
import type { HostSnapshot } from "@/lib/server/collector/types";

const listPoliciesMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error("simulated policy store outage");
  }),
);
const evaluatePoliciesMock = vi.hoisted(() => vi.fn(() => []));
const computeDriftMock = vi.hoisted(() => vi.fn(() => [] as DriftEvent[]));
const storeDriftEventsMock = vi.hoisted(() =>
  vi.fn((_hostId: string, _events: DriftEvent[]) => {}),
);
const listActiveMutesForWorkerMock = vi.hoisted(() => vi.fn(async () => []));
const applyMutesMock = vi.hoisted(
  () => vi.fn((events: DriftEvent[]) => events),
);
const dispatchDriftWebhookMock = vi.hoisted(() => vi.fn(() => {}));
const getTenantNotificationsMock = vi.hoisted(() =>
  vi.fn(async () => ({
    slackWebhookUrl: undefined,
    alertEmailTo: undefined,
  })),
);

vi.mock("@/lib/server/services/policy-service", () => ({
  listPolicies: listPoliciesMock,
  evaluatePolicies: evaluatePoliciesMock,
}));
vi.mock("@/lib/server/drift-engine", () => ({
  computeDrift: computeDriftMock,
  storeDriftEvents: storeDriftEventsMock,
}));
vi.mock("@/lib/server/services/drift-mute-service", () => ({
  listActiveMutesForWorker: listActiveMutesForWorkerMock,
  applyMutes: applyMutesMock,
}));
vi.mock("@/lib/server/outbound-webhook", () => ({
  dispatchDriftWebhook: dispatchDriftWebhookMock,
}));
vi.mock("@/lib/server/services/notifications-service", () => ({
  getTenantNotifications: getTenantNotificationsMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type ProcessHostSnapshotDrift = (typeof import("@/lib/server/services/scan-drift-job"))["processHostSnapshotDrift"];

let processHostSnapshotDrift: ProcessHostSnapshotDrift;

beforeAll(async () => {
  ({ processHostSnapshotDrift } = await import("@/lib/server/services/scan-drift-job"));
}, 30_000);

function makeSnapshot(hostId: string): HostSnapshot {
  return {
    hostId,
    hostname: hostId.replace(/^host-/, ""),
    collectedAt: new Date().toISOString(),
    listeners: [],
    users: [],
    sudoers: [],
    sudoersFiles: [],
    cronEntries: [],
    userCrontabs: [],
    services: [],
    ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
    firewall: { active: true, defaultInbound: "deny", rules: [] },
    authorizedKeys: [],
    fileHashes: [],
    hostsEntries: [],
    suidBinaries: [],
    kernelModules: [],
    installedPackages: [],
    systemdUnitFiles: [],
  };
}

describe("policy evaluation fail-closed", () => {
  it(
    "emits a synthetic policy_failure DriftEvent when policy load fails",
    async () => {
    const snapshot = makeSnapshot("host-1-2-3-4");
    const result = await processHostSnapshotDrift({
      snapshot,
      baseline: snapshot,
      tenantId: "tenant_test",
      jobId: "job_test",
      origin: "agent-push",
    });

    expect(result.events.length).toBeGreaterThan(0);
    const policyFailure = result.events.find(
      (e) => e.category === "policy_failure",
    );
    expect(policyFailure).toBeDefined();
    expect(policyFailure?.severity).toBe("high");
    expect(policyFailure?.lifecycle).toBe("new");
    expect(policyFailure?.title).toMatch(/policy evaluation failed/i);
    expect(policyFailure?.suggestedActions.length).toBeGreaterThan(0);
    },
    15_000,
  );

  it(
    "stores the synthetic event so the dashboard can count it",
    async () => {
    const snapshot = makeSnapshot("host-fail");
    await processHostSnapshotDrift({
      snapshot,
      baseline: snapshot,
      tenantId: "tenant_test",
      jobId: "job_2",
      origin: "scan",
    });

    expect(storeDriftEventsMock).toHaveBeenCalledTimes(1);
    const [hostId, events] = storeDriftEventsMock.mock.calls[0]!;
    expect(hostId).toBe("host-fail");
    const policyFailure = (events as DriftEvent[]).find(
      (e) => e.category === "policy_failure",
    );
    expect(policyFailure).toBeDefined();
    },
    15_000,
  );

  it(
    "does NOT emit a policy_failure event when no tenant is supplied (legacy mode)",
    async () => {
    const snapshot = makeSnapshot("host-legacy");
    const result = await processHostSnapshotDrift({
      snapshot,
      baseline: snapshot,
      jobId: "job_3",
      origin: "scan",
    });

    expect(
      result.events.some((e) => e.category === "policy_failure"),
    ).toBe(false);
    },
    15_000,
  );
});
