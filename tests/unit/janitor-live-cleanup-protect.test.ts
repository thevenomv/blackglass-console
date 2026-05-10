import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { JanitorFinding } from "@/db/schema";
import { JanitorCleanupBlockedError } from "@/lib/server/janitor/janitor-cleanup-blocked-error";
import { performAwsLiveCleanup } from "@/lib/server/janitor/aws-cleanup";
import { performGcpLiveCleanup } from "@/lib/server/janitor/gcp-cleanup";
import { performDigitalOceanLiveCleanup } from "@/lib/server/services/janitor-cleanup-executor";

const awsSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-ec2", () => {
  class EC2Client {
    send = awsSend;
    constructor(_: unknown) {}
  }
  class DescribeInstancesCommand {
    constructor(public input: unknown) {}
  }
  class TerminateInstancesCommand {
    constructor(public input: unknown) {}
  }
  class DescribeVolumesCommand {
    constructor(public input: unknown) {}
  }
  class DeleteVolumeCommand {
    constructor(public input: unknown) {}
  }
  class DescribeSnapshotsCommand {
    constructor(public input: unknown) {}
  }
  class DeleteSnapshotCommand {
    constructor(public input: unknown) {}
  }
  return {
    EC2Client,
    DescribeInstancesCommand,
    TerminateInstancesCommand,
    DescribeVolumesCommand,
    DeleteVolumeCommand,
    DescribeSnapshotsCommand,
    DeleteSnapshotCommand,
  };
});

const gcpFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/janitor/cloud-api-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/janitor/cloud-api-retry")>();
  return {
    ...actual,
    fetchWithCloudRetry: (...args: Parameters<typeof actual.fetchWithCloudRetry>) =>
      gcpFetch(...args),
  };
});

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        getAccessToken: async () => ({ token: "unit-test-token" }),
      };
    }
  },
}));

vi.mock("@/lib/server/secrets/envelope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/secrets/envelope")>();
  return {
    ...actual,
    decryptKey: vi.fn(async () => Buffer.from("unit-test-cloud-credential")),
  };
});

const awsCreds = JSON.stringify({
  accessKeyId: "AKIAUNITTESTEXAMPL",
  secretAccessKey: "secret",
  region: "us-east-1",
});

const encBlob = JSON.stringify({
  ciphertext: "YQ==",
  wrappedDek: "WQ==",
  kmsProvider: "local",
});

const minimalSa = JSON.stringify({
  type: "service_account",
  project_id: "unit-test-proj",
});

describe("AWS live cleanup — pre-delete Describe tag guard", () => {
  beforeEach(() => {
    awsSend.mockReset();
  });

  it("throws JanitorCleanupBlockedError when instance tags match protectors (no Terminate)", async () => {
    awsSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      const n = cmd.constructor.name;
      if (n === "DescribeInstancesCommand") {
        return {
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: "i-blockme",
                  Tags: [{ Key: "env", Value: "production" }],
                },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected ${n}`);
    });

    const finding = {
      resourceType: "ec2_instance",
      resourceId: "i-blockme",
      metricsMeta: { region: "us-east-1" },
    } as unknown as JanitorFinding;

    await expect(performAwsLiveCleanup(awsCreds, finding, ["production"])).rejects.toThrow(
      JanitorCleanupBlockedError,
    );
    expect(awsSend).toHaveBeenCalledTimes(1);
  });

  it("proceeds to TerminateInstances when tags do not match protectors", async () => {
    awsSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      const n = cmd.constructor.name;
      if (n === "DescribeInstancesCommand") {
        return {
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: "i-ok",
                  Tags: [{ Key: "env", Value: "staging" }],
                },
              ],
            },
          ],
        };
      }
      if (n === "TerminateInstancesCommand") {
        return {};
      }
      throw new Error(`unexpected ${n}`);
    });

    const finding = {
      resourceType: "ec2_instance",
      resourceId: "i-ok",
      metricsMeta: { region: "us-east-1" },
    } as unknown as JanitorFinding;

    await performAwsLiveCleanup(awsCreds, finding, ["production"]);
    expect(awsSend).toHaveBeenCalledTimes(2);
  });

  it("throws when ebs_volume Describe tags match protectors", async () => {
    awsSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      const n = cmd.constructor.name;
      if (n === "DescribeVolumesCommand") {
        return {
          Volumes: [{ VolumeId: "vol-block", Tags: [{ Key: "Tier", Value: "production" }] }],
        };
      }
      throw new Error(`unexpected ${n}`);
    });

    const finding = {
      resourceType: "ebs_volume",
      resourceId: "vol-block",
      metricsMeta: { region: "us-east-1" },
    } as unknown as JanitorFinding;

    await expect(performAwsLiveCleanup(awsCreds, finding, ["production"])).rejects.toThrow(
      JanitorCleanupBlockedError,
    );
    expect(awsSend).toHaveBeenCalledTimes(1);
  });

  it("throws when ebs_snapshot Describe tags match protectors", async () => {
    awsSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      const n = cmd.constructor.name;
      if (n === "DescribeSnapshotsCommand") {
        return {
          Snapshots: [{ SnapshotId: "snap-block", Tags: [{ Key: "env", Value: "prod" }] }],
        };
      }
      throw new Error(`unexpected ${n}`);
    });

    const finding = {
      resourceType: "ebs_snapshot",
      resourceId: "snap-block",
      metricsMeta: { region: "us-east-1" },
    } as unknown as JanitorFinding;

    await expect(performAwsLiveCleanup(awsCreds, finding, ["prod"])).rejects.toThrow(
      JanitorCleanupBlockedError,
    );
    expect(awsSend).toHaveBeenCalledTimes(1);
  });
});

describe("GCP live cleanup — pre-delete GET labels guard", () => {
  beforeEach(() => {
    gcpFetch.mockReset();
  });

  it("throws when disk labels match protectors (no DELETE)", async () => {
    gcpFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ labels: { env: "production" } }), { status: 200 }),
    );

    const finding = {
      resourceType: "gce_disk",
      resourceId: "disk-1",
      metricsMeta: { zone: "us-central1-a" },
    } as unknown as JanitorFinding;

    await expect(performGcpLiveCleanup(minimalSa, finding, ["production"])).rejects.toThrow(
      JanitorCleanupBlockedError,
    );
    expect(gcpFetch).toHaveBeenCalledTimes(1);
  });

  it("issues DELETE after benign labels", async () => {
    gcpFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ labels: { env: "dev" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const finding = {
      resourceType: "gce_disk",
      resourceId: "disk-2",
      metricsMeta: { zone: "us-central1-a" },
    } as unknown as JanitorFinding;

    await performGcpLiveCleanup(minimalSa, finding, ["production"]);
    expect(gcpFetch).toHaveBeenCalledTimes(2);
  });

  it("throws when global snapshot labels match protectors", async () => {
    gcpFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ labels: { keep: "blackglass-protected" } }), { status: 200 }),
    );

    const finding = {
      resourceType: "gce_snapshot",
      resourceId: "snap-glob",
      metricsMeta: {},
    } as unknown as JanitorFinding;

    await expect(
      performGcpLiveCleanup(minimalSa, finding, ["blackglass-protected"]),
    ).rejects.toThrow(JanitorCleanupBlockedError);
    expect(gcpFetch).toHaveBeenCalledTimes(1);
  });
});

describe("DigitalOcean live cleanup — pre-delete GET tag guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks when droplet tags match protectors (no DELETE)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        if (u.includes("/v2/droplets/99") && (init?.method ?? "GET").toUpperCase() === "GET") {
          return new Response(
            JSON.stringify({
              droplet: {
                id: 99,
                name: "d",
                status: "active",
                size_slug: "s-1vcpu-1gb",
                tags: ["production"],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    const finding = {
      resourceType: "droplet",
      resourceId: "99",
    } as unknown as JanitorFinding;

    await expect(
      performDigitalOceanLiveCleanup("tenant-x", encBlob, finding, ["production"]),
    ).rejects.toThrow(JanitorCleanupBlockedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("deletes when tags are benign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (u.includes("/v2/droplets/100") && method === "GET") {
          return new Response(
            JSON.stringify({
              droplet: {
                id: 100,
                name: "d",
                status: "active",
                size_slug: "s-1vcpu-1gb",
                tags: ["staging"],
              },
            }),
            { status: 200 },
          );
        }
        if (u.includes("/v2/droplets/100") && method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    const finding = {
      resourceType: "droplet",
      resourceId: "100",
    } as unknown as JanitorFinding;

    await performDigitalOceanLiveCleanup("tenant-x", encBlob, finding, ["production"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("blocks volume when live string tags match protectors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (u.includes("/v2/volumes/vol-x") && u.includes("region=nyc1") && method === "GET") {
          return new Response(
            JSON.stringify({
              volume: {
                id: "vol-x",
                name: "v",
                size_gigabytes: 10,
                tags: ["critical"],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    const finding = {
      resourceType: "volume",
      resourceId: "vol-x",
      metricsMeta: { region: "nyc1" },
    } as unknown as JanitorFinding;

    await expect(
      performDigitalOceanLiveCleanup("tenant-x", encBlob, finding, ["critical"]),
    ).rejects.toThrow(JanitorCleanupBlockedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks snapshot when live tags match protectors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (u.includes("/v2/snapshots/snap-99") && method === "GET") {
          return new Response(
            JSON.stringify({
              snapshot: {
                id: "snap-99",
                name: "s",
                resource_id: "1",
                resource_type: "droplet",
                size_gigabytes: 1,
                tags: ["do-not-delete"],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    const finding = {
      resourceType: "snapshot",
      resourceId: "snap-99",
    } as unknown as JanitorFinding;

    await expect(
      performDigitalOceanLiveCleanup("tenant-x", encBlob, finding, ["do-not-delete"]),
    ).rejects.toThrow(JanitorCleanupBlockedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
