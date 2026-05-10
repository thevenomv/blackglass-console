/**
 * Unit tests for `formatAuditDetail`.
 *
 * The helper exists to defeat audit-log injection: a hostile value of
 * `org='Acme" injected="malicious'` used to escape the `key="value"` grammar
 * of the `detail` string and confuse log parsers (and embed control bytes
 * that corrupt operator terminals). Every value flows through
 * `JSON.stringify`, which normalises quotes, backslashes, newlines, and
 * control bytes.
 *
 * If you change `formatAuditDetail`, keep these properties:
 *   1. The rendered detail must always be a single line.
 *   2. The number of `=` characters at the top level must equal the number
 *      of input fields (so a parser can split predictably).
 *   3. ANSI escape sequences in values MUST NOT survive into the output
 *      verbatim — they must be encoded as `\u001b…`.
 */

import { describe, expect, it } from "vitest";

import { formatAuditDetail } from "@/lib/server/audit-log";

describe("formatAuditDetail()", () => {
  it("renders a clean key=\"value\" string for plain inputs", () => {
    const detail = formatAuditDetail({
      email: "user@example.com",
      org: "Acme Co.",
      band: "high",
    });
    expect(detail).toBe('email="user@example.com" org="Acme Co." band="high"');
  });

  it("emits unquoted numbers and booleans for parser-friendly grepping", () => {
    const detail = formatAuditDetail({
      band: "high",
      range_usd: 5000,
      degraded: true,
    });
    expect(detail).toBe('band="high" range_usd=5000 degraded=true');
  });

  it("preserves field order from the input record", () => {
    const detail = formatAuditDetail({
      z_last: "1",
      a_first: "2",
      m_middle: "3",
    });
    expect(detail).toBe('z_last="1" a_first="2" m_middle="3"');
  });

  it("skips undefined and null values entirely (no empty `key=` artefact)", () => {
    const detail = formatAuditDetail({
      email: "user@example.com",
      org: undefined,
      hosts: null,
      band: "low",
    });
    expect(detail).toBe('email="user@example.com" band="low"');
  });

  // ---- Injection-resistance properties -----------------------------------

  it("escapes embedded double quotes so a JSON-aware parser recovers the exact original value", () => {
    // The classic attack: a value designed to look like an extra field —
    // `org="Acme" injected="malicious"`. The grammar of `detail` is a
    // sequence of `key=<JSON-string-or-number>` tokens, so the contract
    // we care about is: a parser that pulls the JSON-quoted value out
    // and JSON.parses it MUST get back the original input verbatim.
    const original = 'Acme" injected="malicious';
    const detail = formatAuditDetail({ org: original, band: "high" });

    // Pull `org`'s JSON-quoted value out using a tolerant regex (mirrors
    // what an operator's log-parsing pipeline would do). The regex
    // matches `"`...`"` allowing `\\.` escape sequences inside.
    const m = detail.match(/^org=("(?:\\.|[^"\\])*")/);
    expect(m, `detail did not start with a parseable org="..." token: ${detail}`).not.toBeNull();
    expect(JSON.parse(m![1])).toBe(original);

    // After consuming the org token, what remains must be a clean ` band="high"`
    // — proving the injected `injected=` substring stayed quarantined inside
    // the quoted org value and didn't leak into the field stream.
    expect(detail.slice(m![0].length)).toBe(' band="high"');
  });

  it("escapes backslashes (so an attacker can't smuggle quotes through `\\\"`)", () => {
    const detail = formatAuditDetail({ org: 'A\\"B' });
    // After escaping: `\` → `\\` and `"` → `\"`
    expect(detail).toBe('org="A\\\\\\"B"');
  });

  it("encodes newlines so a single audit row stays on one line", () => {
    const detail = formatAuditDetail({
      org: "line one\nline two",
    });
    // No real newline byte should remain — JSON.stringify renders it as `\n`.
    expect(detail).not.toContain("\n");
    expect(detail).toBe('org="line one\\nline two"');
  });

  it("encodes carriage returns and tabs so log files stay parseable", () => {
    const detail = formatAuditDetail({ org: "a\rb\tc" });
    expect(detail).not.toMatch(/[\r\t]/);
    expect(detail).toBe('org="a\\rb\\tc"');
  });

  it("encodes ANSI escape codes (\\x1b) so operator terminals can't be hijacked", () => {
    // CVE-class issue: ANSI sequences in log lines can clear the screen,
    // recolour operator output, or move the cursor to spoof prior rows.
    const detail = formatAuditDetail({
      org: "Acme\x1b[31mFAKE_LOOKING_FIELD\x1b[0m",
    });
    // The raw escape byte must NOT survive into the output.
    expect(detail).not.toContain("\x1b");
    // It should be encoded in JSON's `\u00XX` form.
    expect(detail).toContain("\\u001b");
  });

  it("encodes embedded NUL bytes (which can truncate logs in some sinks)", () => {
    const detail = formatAuditDetail({ org: "before\u0000after" });
    expect(detail).not.toContain("\u0000");
    expect(detail).toContain("\\u0000");
  });

  it("returns an empty string when given an empty record", () => {
    expect(formatAuditDetail({})).toBe("");
  });
});
