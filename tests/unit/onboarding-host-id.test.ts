/**
 * Tests for src/lib/server/onboarding/host-id.ts — the canonical hostId
 * normaliser used by both the SSH-pull collector and the push-agent
 * ingest path. If this drifts, hosts will silently get duplicate
 * inventory entries on collection-mode switch.
 */

import { describe, it, expect } from "vitest";
import {
  normaliseHostId,
  tryNormaliseHostId,
  isCanonicalHostId,
} from "@/lib/server/onboarding/host-id";

describe("normaliseHostId", () => {
  it("turns an IPv4 into the canonical form", () => {
    expect(normaliseHostId("167.99.59.55")).toBe("host-167-99-59-55");
  });

  it("is idempotent on already-canonical IDs", () => {
    expect(normaliseHostId("host-167-99-59-55")).toBe("host-167-99-59-55");
  });

  it("strips a 'host-' prefix the user supplied with extra dots", () => {
    expect(normaliseHostId("host-167.99.59.55")).toBe("host-167-99-59-55");
  });

  it("lower-cases free-form labels", () => {
    expect(normaliseHostId("Production-Web-01")).toBe("host-production-web-01");
  });

  it("collapses runs of separators and strips leading/trailing dashes", () => {
    expect(normaliseHostId("My  Server   (prod) .int")).toBe(
      "host-my-server-prod-int",
    );
  });

  it("handles leading/trailing whitespace", () => {
    expect(normaliseHostId("   web-1.example.com   ")).toBe(
      "host-web-1-example-com",
    );
  });

  it("throws when the input collapses to nothing", () => {
    expect(() => normaliseHostId("///!!!")).toThrow();
    expect(() => normaliseHostId("")).toThrow();
  });

  it("throws when the input is not a string", () => {
    // @ts-expect-error - intentional bad input
    expect(() => normaliseHostId(undefined)).toThrow();
    // @ts-expect-error - intentional bad input
    expect(() => normaliseHostId(123)).toThrow();
  });
});

describe("tryNormaliseHostId", () => {
  it("returns null on bad input instead of throwing", () => {
    expect(tryNormaliseHostId(null)).toBeNull();
    expect(tryNormaliseHostId(undefined)).toBeNull();
    expect(tryNormaliseHostId("")).toBeNull();
    expect(tryNormaliseHostId("///")).toBeNull();
  });

  it("returns the canonical form on good input", () => {
    expect(tryNormaliseHostId("167.99.59.55")).toBe("host-167-99-59-55");
  });
});

describe("isCanonicalHostId", () => {
  it("accepts canonical IDs", () => {
    expect(isCanonicalHostId("host-167-99-59-55")).toBe(true);
    expect(isCanonicalHostId("host-production-web-01")).toBe(true);
    expect(isCanonicalHostId("host-x")).toBe(true);
  });

  it("rejects non-canonical IDs", () => {
    expect(isCanonicalHostId("167.99.59.55")).toBe(false);
    expect(isCanonicalHostId("Host-167-99-59-55")).toBe(false);
    expect(isCanonicalHostId("host-")).toBe(false);
    expect(isCanonicalHostId("host-_x")).toBe(false);
    expect(isCanonicalHostId("host-x-")).toBe(false);
  });
});
