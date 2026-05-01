import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDopplerSecretsDownload } from "@/lib/server/secrets/providers/doppler-secret-provider";
import { parseInfisicalRawSecretPayload } from "@/lib/server/secrets/providers/infisical-secret-provider";
import { SecretFetchError } from "@/lib/server/secrets/errors";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", name), "utf8"));

describe("secret provider response fixtures", () => {
  it("parses Doppler download JSON", () => {
    const body = fixture("doppler-secrets-download.json");
    const pem = parseDopplerSecretsDownload(body, "SSH_PRIVATE_KEY");
    expect(pem).toContain("fixture-line");
  });

  it("rejects missing Doppler secret key", () => {
    const body = fixture("doppler-secrets-download.json");
    expect(() => parseDopplerSecretsDownload(body, "MISSING")).toThrow(SecretFetchError);
  });

  it("parses Infisical flat raw response", () => {
    const body = fixture("infisical-raw-secret-flat.json");
    expect(parseInfisicalRawSecretPayload(body, "SSH_PRIVATE_KEY")).toContain("flat");
  });

  it("parses Infisical nested secretValue", () => {
    const body = fixture("infisical-raw-secret-nested.json");
    expect(parseInfisicalRawSecretPayload(body, "SSH_PRIVATE_KEY")).toContain("nested");
  });
});
