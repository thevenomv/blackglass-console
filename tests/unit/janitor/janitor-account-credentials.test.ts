import { describe, expect, it } from "vitest";
import {
  JanitorAwsCredentialJsonSchema,
  JanitorGcpServiceAccountJsonSchema,
  validateJanitorCredentialJsonShape,
} from "@/lib/janitor/janitor-account-credentials";

describe("janitor-account-credentials", () => {
  it("accepts minimal AWS access-key JSON", () => {
    const r = JanitorAwsCredentialJsonSchema.safeParse({
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "secret",
    });
    expect(r.success).toBe(true);
  });

  it("rejects AWS JSON with unknown keys (strict)", () => {
    const r = JanitorAwsCredentialJsonSchema.safeParse({
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "secret",
      extra: "nope",
    });
    expect(r.success).toBe(false);
  });

  it("accepts AWS JSON with regions cap", () => {
    const r = JanitorAwsCredentialJsonSchema.safeParse({
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "secret",
      regions: ["us-east-1", "eu-west-1"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts GCP service account JSON with extra fields", () => {
    const r = JanitorGcpServiceAccountJsonSchema.safeParse({
      type: "service_account",
      project_id: "p",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
      client_email: "x@p.iam.gserviceaccount.com",
      token_uri: "https://oauth2.googleapis.com/token",
    });
    expect(r.success).toBe(true);
  });

  it("routes validateJanitorCredentialJsonShape by provider", () => {
    expect(validateJanitorCredentialJsonShape("aws", { accessKeyId: "x", secretAccessKey: "y" }).success).toBe(
      false,
    );
    expect(
      validateJanitorCredentialJsonShape("aws", {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "y",
      }).success,
    ).toBe(true);
  });
});
