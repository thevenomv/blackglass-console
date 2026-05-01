import { afterEach, describe, expect, it } from "vitest";
import { configuredCollectorHostIds } from "@/lib/server/collector-env";

describe("configuredCollectorHostIds", () => {
  afterEach(() => {
    for (let i = 1; i <= 9; i++) delete process.env[`COLLECTOR_HOST_${i}`];
  });

  it("returns host- ids matching collector hostId derivation", () => {
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_HOST_2 = "10.0.0.5";
    expect(configuredCollectorHostIds()).toEqual(["host-127-0-0-1", "host-10-0-0-5"]);
  });

  it("stops at first gap", () => {
    process.env.COLLECTOR_HOST_1 = "a.example";
    process.env.COLLECTOR_HOST_3 = "skipped.example";
    expect(configuredCollectorHostIds()).toEqual(["host-a-example"]);
  });
});
