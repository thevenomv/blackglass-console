import { describe, expect, it } from "vitest";
import { mapPool } from "@/lib/server/async-pool";

describe("mapPool", () => {
  it("preserves order", async () => {
    const out = await mapPool([3, 2, 1], 2, async (n) => n * 10);
    expect(out).toEqual([30, 20, 10]);
  });

  it("respects concurrency cap (sequential when limit is 1)", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool(["a", "b", "c", "d"], 1, async (s) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return s + s;
    });
    expect(peak).toBe(1);
    expect(out).toEqual(["aa", "bb", "cc", "dd"]);
  });

  it("allows up to limit concurrent tasks", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 8));
      active--;
      return n + 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(out).toEqual([2, 3, 4, 5, 6]);
  });
});
