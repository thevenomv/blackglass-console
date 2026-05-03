import { describe, expect, it } from "vitest";
import { soleOwnerDemotionBlocked } from "@/lib/saas/member-guards";

describe("member guards", () => {
  it("blocks demoting the only owner", () => {
    const m = [
      { userId: "a", role: "owner" as const, status: "active" },
      { userId: "b", role: "viewer" as const, status: "active" },
    ];
    expect(soleOwnerDemotionBlocked(m, "a", "viewer")).toBe(true);
  });

  it("allows demoting one owner when another exists", () => {
    const m = [
      { userId: "a", role: "owner" as const, status: "active" },
      { userId: "b", role: "owner" as const, status: "active" },
    ];
    expect(soleOwnerDemotionBlocked(m, "a", "viewer")).toBe(false);
  });
});
