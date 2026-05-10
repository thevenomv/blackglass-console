import { describe, expect, it } from "vitest";
import { janitorFindingConsoleUrl } from "@/lib/janitor/cloud-console-links";

describe("cloud-console-links", () => {
  it("builds DO droplet URL", () => {
    expect(
      janitorFindingConsoleUrl({
        provider: "do",
        resourceType: "droplet",
        resourceId: "12345",
        metricsMeta: null,
      }),
    ).toBe("https://cloud.digitalocean.com/droplets/12345");
  });

  it("builds AWS volume URL with region in meta", () => {
    const u = janitorFindingConsoleUrl({
      provider: "aws",
      resourceType: "ebs_volume",
      resourceId: "vol-abc",
      metricsMeta: { region: "eu-west-1" },
    });
    expect(u).toContain("eu-west-1");
    expect(u).toContain("VolumeDetails");
    expect(u).toContain("vol-abc");
  });

  it("builds GCP disk URL when project and zone present", () => {
    const u = janitorFindingConsoleUrl({
      provider: "gcp",
      resourceType: "gce_disk",
      resourceId: "my-disk",
      metricsMeta: { gcpProjectId: "my-proj", zone: "us-central1-a" },
    });
    expect(u).toContain("my-proj");
    expect(u).toContain("us-central1-a");
    expect(u).toContain("my-disk");
  });
});
