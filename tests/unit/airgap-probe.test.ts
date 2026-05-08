/**
 * Lock-down tests for the active air-gap self-test mode
 * (`/api/health/airgap?probe=true`). Verifies the gate is wired
 * correctly in BOTH air-gap-on and air-gap-off modes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIG = process.env.BLACKGLASS_AIRGAPPED;

beforeEach(() => {
  delete process.env.BLACKGLASS_AIRGAPPED;
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.BLACKGLASS_AIRGAPPED;
  else process.env.BLACKGLASS_AIRGAPPED = ORIG;
});

async function callProbe() {
  const { GET } = await import("../../src/app/api/health/airgap/route");
  const res = await GET(new Request("http://localhost/api/health/airgap?probe=true"));
  return (await res.json()) as {
    status: string;
    probes?: Array<{ name: string; expectedSkip: boolean; actualSkip: boolean; pass: boolean }>;
    probesPassing?: boolean;
  };
}

describe("/api/health/airgap?probe=true", () => {
  it("with air-gap OFF, every probe shows actualSkip=false and probes pass", async () => {
    const body = await callProbe();
    expect(body.status).toBe("disabled");
    expect(body.probesPassing).toBe(true);
    expect(body.probes).toBeDefined();
    expect(body.probes!.every((p) => p.actualSkip === false)).toBe(true);
  });

  it("with air-gap ON, public hosts skip and internal hosts don't", async () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    const body = await callProbe();
    expect(body.status).toBe("airgap-active");
    expect(body.probesPassing).toBe(true);

    const probes = body.probes!;
    // Public hosts must skip.
    expect(probes.find((p) => p.name === "public-stripe")?.actualSkip).toBe(true);
    expect(probes.find((p) => p.name === "public-slack")?.actualSkip).toBe(true);
    expect(probes.find((p) => p.name === "public-pagerduty")?.actualSkip).toBe(true);
    // Internal hosts must NOT skip (allow-list works).
    expect(probes.find((p) => p.name === "internal-localhost")?.actualSkip).toBe(false);
    expect(probes.find((p) => p.name === "internal-rfc1918")?.actualSkip).toBe(false);
    expect(probes.find((p) => p.name === "internal-svc-cluster")?.actualSkip).toBe(false);
  });
});
