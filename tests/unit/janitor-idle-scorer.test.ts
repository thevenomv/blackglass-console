import { describe, expect, it } from "vitest";
import { scoreDroplet, scoreSnapshot, scoreVolume } from "@/lib/server/janitor/idle-scorer";

describe("janitor idle-scorer", () => {
  it("scores idle droplet when CPU and network are flat", () => {
    const r = scoreDroplet({
      droplet: {
        id: 1,
        name: "test",
        status: "active",
        created_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
        size_slug: "s-1vcpu-1gb",
        tags: [],
      },
      avgCpuPercent: 2,
      avgNetworkTx: 1000,
    });
    expect(r.idleScore).toBeGreaterThan(40);
    expect(r.estimatedWasteMonthly).toBeGreaterThan(0);
  });

  it("returns zero for protector-tagged droplets", () => {
    const r = scoreDroplet({
      droplet: {
        id: 2,
        name: "prod",
        status: "active",
        created_at: new Date().toISOString(),
        size_slug: "s-2vcpu-4gb",
        tags: ["production"],
      },
      avgCpuPercent: 0,
      avgNetworkTx: 0,
    });
    expect(r.idleScore).toBe(0);
    expect(r.estimatedWasteMonthly).toBe(0);
  });

  it("scores unattached volumes", () => {
    const r = scoreVolume({
      id: "vol-1",
      name: "orphan",
      size_gigabytes: 100,
      droplet_ids: [],
      created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    });
    expect(r.idleScore).toBeGreaterThan(50);
  });

  it("scores old snapshots", () => {
    const r = scoreSnapshot({
      id: "snap-1",
      name: "old",
      resource_id: "123",
      resource_type: "droplet",
      size_gigabytes: 20,
      created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
    });
    expect(r.idleScore).toBeGreaterThanOrEqual(60);
  });
});
