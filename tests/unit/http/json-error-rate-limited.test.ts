/**
 * Tests for the canonical 429 helper. Centralised to ensure every
 * rate-limited v1 response carries the same envelope and a
 * `Retry-After` header — downstream SDKs and CLI tools rely on this
 * being predictable.
 */

import { describe, it, expect } from "vitest";
import { rateLimitedResponse } from "@/lib/server/http/json-error";

describe("rateLimitedResponse", () => {
  it("returns 429 with the canonical envelope", async () => {
    const res = rateLimitedResponse();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; detail?: string };
    expect(body.error).toBe("rate_limited");
    expect(body.detail).toMatch(/Too many requests/);
  });

  it("threads the request id into x-request-id when supplied", async () => {
    const res = rateLimitedResponse("req-123");
    expect(res.headers.get("x-request-id")).toBe("req-123");
  });

  it("sets Retry-After to the supplied window (default 60s)", () => {
    const def = rateLimitedResponse();
    expect(def.headers.get("Retry-After")).toBe("60");

    const custom = rateLimitedResponse("req-x", 30);
    expect(custom.headers.get("Retry-After")).toBe("30");
  });

  it("includes the strict CSP header consistent with jsonError", () => {
    const res = rateLimitedResponse();
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'",
    );
  });
});
