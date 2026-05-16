import { describe, expect, it } from "vitest";
import {
  classifyDriftRiskBand,
  emptyDriftRiskInput,
  RISK_BAND_THRESHOLDS,
  scoreLinuxDriftRisk,
  type DriftRiskInput,
} from "@/lib/tools/linux-drift-risk/engine";

function withInput(partial: Partial<DriftRiskInput>): DriftRiskInput {
  return { ...emptyDriftRiskInput(), ...partial };
}

describe("scoreLinuxDriftRisk", () => {
  it("returns the lowest possible score for a textbook-mature posture", () => {
    const r = scoreLinuxDriftRisk(emptyDriftRiskInput());
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
    expect(r.topClasses.length).toBe(3);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("classifies a worst-case posture as critical", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        distros: ["deb", "rhel", "amzn", "alpine"],
        configMgmt: "none",
        sshKeys: "ad-hoc",
        compliance: "high",
        telemetry: "none",
      }),
    );
    expect(r.score).toBeGreaterThan(RISK_BAND_THRESHOLDS.highMaxScore);
    expect(r.band).toBe("critical");
  });

  it("caps the score at 100", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        distros: ["deb", "rhel", "amzn", "suse", "alpine", "other"],
        configMgmt: "none",
        sshKeys: "ad-hoc",
        compliance: "high",
        telemetry: "none",
      }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("medium band is reachable from realistic mid-maturity inputs", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        distros: ["deb"],
        configMgmt: "occasional",
        sshKeys: "documented",
        compliance: "moderate",
        telemetry: "partial",
      }),
    );
    expect(r.score).toBeGreaterThan(RISK_BAND_THRESHOLDS.lowMaxScore);
    expect(r.score).toBeLessThanOrEqual(RISK_BAND_THRESHOLDS.mediumMaxScore);
    expect(r.band).toBe("medium");
  });

  it("ad-hoc SSH always pushes 'ssh' to the top of the class list", () => {
    const r = scoreLinuxDriftRisk(withInput({ sshKeys: "ad-hoc" }));
    expect(r.topClasses[0]?.id).toBe("ssh");
  });

  it("no config management surfaces 'package' before defaults", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        configMgmt: "none",
        sshKeys: "automated",
      }),
    );
    expect(r.topClasses.map((c) => c.id)).toContain("package");
  });

  it("high compliance pressure surfaces 'privilege' in the top three", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        compliance: "high",
        sshKeys: "automated",
      }),
    );
    expect(r.topClasses.map((c) => c.id)).toContain("privilege");
  });

  it("contributions list mirrors the inputs that scored above zero", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        distros: ["deb", "rhel"],
        configMgmt: "occasional",
        sshKeys: "documented",
        compliance: "moderate",
        telemetry: "partial",
      }),
    );
    const total = r.contributions.reduce((s, c) => s + c.points, 0);
    expect(total).toBe(r.score);
  });

  it("ignores unknown distro values without crashing", () => {
    const r = scoreLinuxDriftRisk(
      withInput({
        // @ts-expect-error intentional bad input
        distros: ["windows", "deb"],
      }),
    );
    expect(r.score).toBe(0);
  });

  it("recommendations always include a cadence guideline", () => {
    const lowR = scoreLinuxDriftRisk(emptyDriftRiskInput());
    const highR = scoreLinuxDriftRisk(
      withInput({
        configMgmt: "none",
        sshKeys: "ad-hoc",
        compliance: "high",
        telemetry: "none",
      }),
    );
    expect(lowR.recommendations.some((r) => /quarterly|annual/i.test(r))).toBe(true);
    expect(highR.recommendations.some((r) => /fortnightly|three months/i.test(r))).toBe(true);
  });
});

describe("classifyDriftRiskBand", () => {
  it("uses inclusive upper bounds at every threshold", () => {
    expect(classifyDriftRiskBand(0)).toBe("low");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.lowMaxScore)).toBe("low");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.lowMaxScore + 1)).toBe("medium");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.mediumMaxScore)).toBe("medium");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.mediumMaxScore + 1)).toBe("high");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.highMaxScore)).toBe("high");
    expect(classifyDriftRiskBand(RISK_BAND_THRESHOLDS.highMaxScore + 1)).toBe("critical");
    expect(classifyDriftRiskBand(100)).toBe("critical");
  });

  it("treats NaN/negatives as low", () => {
    expect(classifyDriftRiskBand(Number.NaN)).toBe("low");
    expect(classifyDriftRiskBand(-50)).toBe("low");
  });
});
