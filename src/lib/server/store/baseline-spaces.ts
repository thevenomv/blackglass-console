import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { HostSnapshot } from "@/lib/server/collector/types";
import type { BaselineRepository, BaselineStoreHealth } from "./types";
import { StoreError } from "./types";

export class SpacesBaselineRepository implements BaselineRepository {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    key: string,
    secret: string,
    endpoint: string,
    region: string,
  ) {
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: key, secretAccessKey: secret },
      forcePathStyle: false,
    });
  }

  private keyFor(hostId: string) {
    return `baselines/${hostId}.json`;
  }

  async save(snapshot: HostSnapshot): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.keyFor(snapshot.hostId),
          Body: JSON.stringify(snapshot),
          ContentType: "application/json",
        }),
      );
    } catch (err) {
      console.error("[baseline-store/spaces] Failed to save:", err);
      throw new StoreError("unavailable", "Spaces write failed", err);
    }
  }

  async get(hostId: string): Promise<HostSnapshot | undefined> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(hostId) }),
      );
      const text = await resp.Body?.transformToString();
      if (!text) return undefined;
      try {
        return JSON.parse(text) as HostSnapshot;
      } catch (parseErr) {
        throw new StoreError("corrupt_record", `Baseline for ${hostId} failed to parse`, parseErr);
      }
    } catch (err: unknown) {
      if (err instanceof StoreError) throw err;
      if ((err as { name?: string }).name === "NoSuchKey") return undefined;
      console.error("[baseline-store/spaces] Failed to get:", err);
      throw new StoreError("unavailable", "Spaces read failed", err);
    }
  }

  async listHostIds(): Promise<string[]> {
    try {
      const resp = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: "baselines/" }),
      );
      return (resp.Contents ?? [])
        .map((obj) =>
          obj.Key?.replace(/^baselines\//, "").replace(/\.json$/, "") ?? "",
        )
        .filter(Boolean);
    } catch (err) {
      console.error("[baseline-store/spaces] Failed to list:", err);
      return [];
    }
  }

  async has(hostId: string): Promise<boolean> {
    return (await this.get(hostId)) !== undefined;
  }

  health(): BaselineStoreHealth {
    return { adapter: "spaces", configured: true, writable: null };
  }
}
