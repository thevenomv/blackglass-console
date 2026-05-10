import { describe, expect, it } from "vitest";
import { validateAwsReadCredentialStub } from "@/lib/server/janitor/aws-read-stub";
import { validateGcpReadCredentialStub } from "@/lib/server/janitor/gcp-read-stub";
import {
  isJanitorCloudProvider,
  janitorProviderLabel,
  janitorProviderScanImplemented,
} from "@/lib/janitor/providers";

describe("Charon multi-cloud scaffolding", () => {
  it("labels and scan-implementation flags", () => {
    expect(janitorProviderLabel("do")).toBe("DigitalOcean");
    expect(janitorProviderScanImplemented("do")).toBe(true);
    expect(janitorProviderScanImplemented("aws")).toBe(true);
    expect(janitorProviderScanImplemented("gcp")).toBe(true);
  });

  it("isJanitorCloudProvider", () => {
    expect(isJanitorCloudProvider("do")).toBe(true);
    expect(isJanitorCloudProvider("azure")).toBe(false);
  });

  it("AWS stub accepts long opaque token or access-key JSON shape", async () => {
    const short = await validateAwsReadCredentialStub("x".repeat(20));
    expect(short.ok).toBe(false);

    const long = await validateAwsReadCredentialStub("x".repeat(40));
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.verified).toContain("aws:read_stub");

    const jsonOk = await validateAwsReadCredentialStub(
      JSON.stringify({ accessKeyId: "AKIA", secretAccessKey: "secret" }),
    );
    expect(jsonOk.ok).toBe(true);
  });

  it("GCP stub accepts service account JSON or long opaque token", async () => {
    const jsonOk = await validateGcpReadCredentialStub(
      JSON.stringify({ type: "service_account", project_id: "p" }),
    );
    expect(jsonOk.ok).toBe(true);
    if (jsonOk.ok) expect(jsonOk.verified.join(" ")).toContain("gcp");
  });
});
