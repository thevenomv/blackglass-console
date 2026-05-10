import { describe, expect, it } from "vitest";
import {
  findingMatchesExcludeTags,
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
});
