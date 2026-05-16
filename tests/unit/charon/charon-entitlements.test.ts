import { describe, expect, it } from "vitest";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";

describe("Charon plan entitlements", () => {
  it("Lab allows one linked account and no cleanup queue", () => {
    const e = resolveCharonEntitlements("lab");
    expect(e.linkedAccountsMax).toBe(1);
    expect(e.cleanupQueue).toBe(false);
    expect(e.liveCleanup).toBe(false);
    expect(e.charonAddon).toBe(false);
  });

  it("Lab + Charon add-on unlocks cleanup queue and raises cap to 5", () => {
    const e = resolveCharonEntitlements("lab", { charonAddon: true });
    expect(e.cleanupQueue).toBe(true);
    expect(e.linkedAccountsMax).toBe(5);
    expect(e.charonAddon).toBe(true);
  });

  it("Starter allows cleanup queue but not live cleanup", () => {
    const e = resolveCharonEntitlements("starter");
    expect(e.linkedAccountsMax).toBe(5);
    expect(e.cleanupQueue).toBe(true);
    expect(e.liveCleanup).toBe(false);
  });

  it("Growth enables live cleanup", () => {
    const e = resolveCharonEntitlements("growth");
    expect(e.liveCleanup).toBe(true);
    expect(e.linkedAccountsMax).toBe(25);
  });

  it("Charon add-on adds +10 linked accounts on paid tiers (capped)", () => {
    const e = resolveCharonEntitlements("starter", { charonAddon: true });
    expect(e.linkedAccountsMax).toBe(15);
    expect(e.cleanupQueue).toBe(true);
  });

  it("isCharonAddonEnabled reads features.addons.charon", () => {
    expect(isCharonAddonEnabled({ addons: { charon: true } })).toBe(true);
    expect(isCharonAddonEnabled({ addons: { charon: false } })).toBe(false);
    expect(isCharonAddonEnabled({})).toBe(false);
  });
});
