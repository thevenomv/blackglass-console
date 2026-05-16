import { describe, expect, it } from "vitest";
import { filterFindingsBySuppressions } from "@/lib/server/services/janitor-suppression-service";
import { resolveAwsScanRegions, parseAwsAccessJson } from "@/lib/server/janitor/aws-ec2-read";

describe("Charon suppressions", () => {
  it("filterFindingsBySuppressions removes dismissed and active snoozes", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const rows = [
      {
        tenantId: "t1",
        accountId: "a1",
        resourceType: "droplet",
        resourceId: "1",
        resourceName: "x",
        idleScore: 50,
        estimatedWasteMonthly: "1",
      },
      {
        tenantId: "t1",
        accountId: "a1",
        resourceType: "volume",
        resourceId: "v1",
        resourceName: "y",
        idleScore: 50,
        estimatedWasteMonthly: "2",
      },
      {
        tenantId: "t1",
        accountId: "a1",
        resourceType: "snapshot",
        resourceId: "s1",
        resourceName: "z",
        idleScore: 50,
        estimatedWasteMonthly: "3",
      },
    ] as const;

    const suppressions = [
      {
        id: "sup1",
        tenantId: "t1",
        accountId: "a1",
        resourceType: "droplet",
        resourceId: "1",
        kind: "dismiss",
        snoozeUntil: null,
        note: null,
        createdByUserId: null,
        createdAt: now,
      },
      {
        id: "sup2",
        tenantId: "t1",
        accountId: "a1",
        resourceType: "volume",
        resourceId: "v1",
        kind: "snooze",
        snoozeUntil: new Date("2026-02-01T00:00:00Z"),
        note: null,
        createdByUserId: null,
        createdAt: now,
      },
      {
        id: "sup3",
        tenantId: "t1",
        accountId: "a1",
        resourceType: "snapshot",
        resourceId: "s1",
        kind: "snooze",
        snoozeUntil: new Date("2026-01-01T00:00:00Z"),
        note: null,
        createdByUserId: null,
        createdAt: now,
      },
    ];

    const out = filterFindingsBySuppressions([...rows], suppressions as never, now);
    expect(out.map((r) => r.resourceId).sort()).toEqual(["s1"]);
  });
});

describe("AWS multi-region scan config", () => {
  it("resolveAwsScanRegions caps and dedupes", () => {
    const raw = JSON.stringify({
      accessKeyId: "AKIA0123456789ABCD",
      secretAccessKey: "secret",
      regions: ["us-east-1", "us-east-1", "eu-west-1"],
    });
    const p = parseAwsAccessJson(raw);
    expect(resolveAwsScanRegions(p)).toEqual(["us-east-1", "eu-west-1"]);
  });

  it("falls back to single region field", () => {
    const raw = JSON.stringify({
      accessKeyId: "AKIA0123456789ABCD",
      secretAccessKey: "secret",
      region: "ap-south-1",
    });
    const p = parseAwsAccessJson(raw);
    expect(resolveAwsScanRegions(p)).toEqual(["ap-south-1"]);
  });
});
