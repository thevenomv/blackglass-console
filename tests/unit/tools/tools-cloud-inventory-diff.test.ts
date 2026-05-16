import { describe, expect, it } from "vitest";
import {
  diffInventories,
  formatFieldValue,
  InventoryParseError,
  parseInventory,
  type InventorySnapshot,
} from "@/lib/tools/cloud-inventory-diff/engine";

const VALID_BEFORE = `{
  "snapshot_id": "before",
  "captured_at": "2026-05-01T00:00:00Z",
  "provider": "do",
  "resources": [
    { "kind": "droplet", "id": "d1", "region": "lon1", "size": "s-2vcpu-4gb", "tags": ["staging"] },
    { "kind": "droplet", "id": "d2", "region": "nyc1", "size": "s-4vcpu-8gb" },
    { "kind": "volume",  "id": "v1", "size_gb": 100, "attached_to": "d1" }
  ]
}`;

const VALID_AFTER = `{
  "snapshot_id": "after",
  "captured_at": "2026-05-09T00:00:00Z",
  "provider": "do",
  "resources": [
    { "kind": "droplet", "id": "d1", "region": "lon1", "size": "s-4vcpu-8gb", "tags": ["staging", "owner:platform"] },
    { "kind": "volume",  "id": "v1", "size_gb": 100, "attached_to": "d1" },
    { "kind": "snapshot", "id": "s1", "size_gb": 40 }
  ]
}`;

describe("parseInventory", () => {
  it("parses a valid snapshot", () => {
    const s = parseInventory(VALID_BEFORE);
    expect(s.resources).toHaveLength(3);
    expect(s.snapshot_id).toBe("before");
    expect(s.provider).toBe("do");
  });

  it("throws InventoryParseError on invalid JSON", () => {
    expect(() => parseInventory("{ not json")).toThrow(InventoryParseError);
  });

  it("throws when top level is not an object", () => {
    expect(() => parseInventory("[1,2,3]")).toThrow(InventoryParseError);
  });

  it("throws when resources array is missing", () => {
    expect(() => parseInventory('{"snapshot_id":"x"}')).toThrow(InventoryParseError);
  });

  it("skips resources missing kind/id rather than failing", () => {
    const s = parseInventory(
      '{"resources":[{"kind":"droplet","id":"keep"},{"kind":"droplet"},{"id":"alone"}]}',
    );
    expect(s.resources).toHaveLength(1);
    expect(s.resources[0]?.id).toBe("keep");
  });

  it("throws when zero usable resources are present", () => {
    expect(() =>
      parseInventory('{"resources":[{"kind":"droplet"},{"id":"alone"}]}'),
    ).toThrow(InventoryParseError);
  });
});

describe("diffInventories", () => {
  const before = parseInventory(VALID_BEFORE);
  const after = parseInventory(VALID_AFTER);

  it("classifies resources into added/removed/changed accurately", () => {
    const d = diffInventories(before, after);
    expect(d.totals.added).toBe(1);
    expect(d.totals.removed).toBe(1);
    expect(d.totals.changed).toBe(1);
  });

  it("identifies the changed droplet and the specific fields", () => {
    const d = diffInventories(before, after);
    const changed = d.diffs.find((x) => x.op === "changed" && x.id === "d1");
    expect(changed).toBeTruthy();
    const fields = changed?.changes?.map((c) => c.field).sort();
    expect(fields).toEqual(["size", "tags"]);
  });

  it("identifies removed (d2) and added (s1)", () => {
    const d = diffInventories(before, after);
    expect(d.diffs.some((x) => x.op === "removed" && x.id === "d2")).toBe(true);
    expect(d.diffs.some((x) => x.op === "added" && x.id === "s1")).toBe(true);
  });

  it("treats tag arrays as unordered when computing equality", () => {
    const a: InventorySnapshot = {
      resources: [{ kind: "droplet", id: "x", tags: ["a", "b"] }],
    };
    const b: InventorySnapshot = {
      resources: [{ kind: "droplet", id: "x", tags: ["b", "a"] }],
    };
    expect(diffInventories(a, b).totals.changed).toBe(0);
  });

  it("produces an empty diff for identical snapshots", () => {
    const d = diffInventories(before, before);
    expect(d.totals.added).toBe(0);
    expect(d.totals.removed).toBe(0);
    expect(d.totals.changed).toBe(0);
    expect(d.diffs).toHaveLength(0);
  });

  it("byKind tallies match the totals", () => {
    const d = diffInventories(before, after);
    const sums = d.byKind.reduce(
      (acc, k) => {
        acc.added += k.added;
        acc.removed += k.removed;
        acc.changed += k.changed;
        return acc;
      },
      { added: 0, removed: 0, changed: 0 },
    );
    expect(sums).toEqual(d.totals);
  });

  it("warns when providers differ", () => {
    const a: InventorySnapshot = {
      provider: "do",
      resources: [{ kind: "droplet", id: "1" }],
    };
    const b: InventorySnapshot = {
      provider: "aws",
      resources: [{ kind: "instance", id: "1" }],
    };
    const d = diffInventories(a, b);
    expect(d.warnings.length).toBeGreaterThan(0);
    expect(d.warnings[0]).toMatch(/different providers/);
  });

  it("ignores duplicate (kind,id) pairs by keeping the first", () => {
    const a: InventorySnapshot = {
      resources: [
        { kind: "droplet", id: "x", region: "lon1" },
        { kind: "droplet", id: "x", region: "nyc1" },
      ],
    };
    const b: InventorySnapshot = {
      resources: [{ kind: "droplet", id: "x", region: "lon1" }],
    };
    expect(diffInventories(a, b).totals.changed).toBe(0);
  });

  it("does not flag a change when both sides are unset (undefined vs null)", () => {
    const a: InventorySnapshot = {
      resources: [{ kind: "droplet", id: "x", region: "lon1", attached_to: null }],
    };
    const b: InventorySnapshot = {
      resources: [{ kind: "droplet", id: "x", region: "lon1" }],
    };
    expect(diffInventories(a, b).totals.changed).toBe(0);
  });

  it("orders diffs as changed, then removed, then added", () => {
    const d = diffInventories(before, after);
    const ops = d.diffs.map((x) => x.op);
    const order = { changed: 0, removed: 1, added: 2 } as const;
    for (let i = 1; i < ops.length; i++) {
      expect(order[ops[i]!]).toBeGreaterThanOrEqual(order[ops[i - 1]!]);
    }
  });
});

describe("formatFieldValue", () => {
  it("renders undefined as em-dash and null literally", () => {
    expect(formatFieldValue(undefined)).toBe("—");
    expect(formatFieldValue(null)).toBe("null");
  });
  it("renders an empty array distinctly from a missing field", () => {
    expect(formatFieldValue([])).toBe("(empty)");
    expect(formatFieldValue(["a", "b"])).toBe("a, b");
  });
  it("renders objects as JSON", () => {
    expect(formatFieldValue({ x: 1 })).toBe('{"x":1}');
  });
  it("renders primitives via String()", () => {
    expect(formatFieldValue(42)).toBe("42");
    expect(formatFieldValue(true)).toBe("true");
  });
});
