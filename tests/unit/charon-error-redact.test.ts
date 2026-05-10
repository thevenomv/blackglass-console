import { describe, expect, it } from "vitest";
import { redactSensitivePlaintext } from "@/lib/janitor/charon-error-redact";

describe("charon-error-redact", () => {
  it("redacts AWS access key ids and PEM blocks", () => {
    const s = redactSensitivePlaintext(
      "x AKIA0123456789ABCDEF tail -----BEGIN PRIVATE KEY-----XX-----END PRIVATE KEY-----",
    );
    expect(s).toContain("AKIA…REDACTED");
    expect(s).toContain("[redacted:pem]");
    expect(s).not.toContain("BEGIN PRIVATE KEY");
  });

  it("truncates long input", () => {
    const long = "a".repeat(5000);
    expect(redactSensitivePlaintext(long, 100).length).toBe(100);
  });
});
