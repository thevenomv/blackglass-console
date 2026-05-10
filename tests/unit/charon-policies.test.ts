import { describe, expect, it } from "vitest";
import {
  findingMatchesExcludeTags,
  findingIsProtectTagged,
  findingMatchesProtectTags,
  parseCharonPolicies,
} from "@/lib/janitor/charon-policies";

describe("Charon policies", () => {
  it("parseCharonPolicies applies defaults", () => {
    const p = parseCharonPolicies({});
    expect(p.excludeTagsLower).toEqual([]);
    expect(p.minIdleScore).toBeNull();
    expect(p.emailDigestOnScan).toBe(false);
    expect(p.webhookOnScan).toBe(false);
  });

  it("findingMatchesExcludeTags checks tag keys and values", () => {
    expect(findingMatchesExcludeTags({ env: "staging" }, ["staging"])).toBe(true);
    expect(findingMatchesExcludeTags({ staging: "true" }, ["staging"])).toBe(true);
    expect(findingMatchesExcludeTags({ env: "prod" }, ["staging"])).toBe(false);
  });

  it("findingMatchesProtectTags", () => {
    expect(findingMatchesProtectTags({ keep: "true" }, ["keep"])).toBe(true);
    expect(findingMatchesProtectTags({}, ["keep"])).toBe(false);
  });

  it("findingIsProtectTagged merges built-in markers with tenant extras", () => {
    const p = parseCharonPolicies({ protectTagsExtraLower: ["keep-forever"] });
    expect(findingIsProtectTagged({ env: "production" }, p)).toBe(true);
    expect(findingIsProtectTagged({ tier: "prod" }, p)).toBe(true);
    expect(findingIsProtectTagged({ "keep-forever": "yes" }, p)).toBe(true);
    expect(findingIsProtectTagged({ env: "staging" }, p)).toBe(false);
  });
});
