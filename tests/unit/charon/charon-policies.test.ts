import { describe, expect, it } from "vitest";
import {
  findingMatchesExcludeTags,
  findingIsProtectTagged,
  findingMatchesProtectTags,
  parseCharonPolicies,
  recordFromAwsEc2Tags,
  recordFromDoStringTags,
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

  it("recordFromAwsEc2Tags feeds protector matching", () => {
    const rec = recordFromAwsEc2Tags([{ Key: "Environment", Value: "production" }]);
    expect(findingMatchesProtectTags(rec, ["production"])).toBe(true);
    expect(findingMatchesProtectTags(rec, ["staging"])).toBe(false);
  });

  it("recordFromDoStringTags feeds protector matching for flat DO tag names", () => {
    const rec = recordFromDoStringTags(["staging", "blackglass-protected"]);
    expect(findingMatchesProtectTags(rec, ["blackglass-protected"])).toBe(true);
    expect(findingMatchesProtectTags(rec, ["prod"])).toBe(false);
  });
});
