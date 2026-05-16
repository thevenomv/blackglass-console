import { describe, expect, it, vi } from "vitest";
import { fetchWithCloudRetry, isRetryableAwsSdkError, withAwsRetry } from "@/lib/server/janitor/cloud-api-retry";

describe("cloud-api-retry", () => {
  it("withAwsRetry succeeds after transient errors", async () => {
    let n = 0;
    const result = await withAwsRetry(async () => {
      n += 1;
      if (n < 3) {
        const err = new Error("slow down");
        (err as { name: string }).name = "Throttling";
        throw err;
      }
      return 42;
    });
    expect(result).toBe(42);
    expect(n).toBe(3);
  });

  it("isRetryableAwsSdkError recognizes throttling metadata", () => {
    expect(isRetryableAwsSdkError({ name: "Throttling" })).toBe(true);
    expect(isRetryableAwsSdkError({ $metadata: { httpStatusCode: 429 } })).toBe(true);
    expect(isRetryableAwsSdkError({ name: "AccessDenied" })).toBe(false);
  });

  it("fetchWithCloudRetry retries 429", async () => {
    const res429 = { ok: false, status: 429 } as Response;
    const res200 = { ok: true, status: 200 } as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res429)
      .mockResolvedValueOnce(res429)
      .mockResolvedValueOnce(res200);
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithCloudRetry("https://example.test/x", { cache: "no-store" });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });
});
