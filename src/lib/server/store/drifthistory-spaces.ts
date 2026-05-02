import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DayEntry, DriftHistoryRepository } from "./types";
import { StoreError } from "./types";

const KEY = "drift-history.json";
type FileShape = { days: DayEntry[] };

export class SpacesDriftHistoryRepository implements DriftHistoryRepository {
  readonly adapter = "spaces" as const;

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

  private async load(): Promise<FileShape> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: KEY }),
      );
      const text = await resp.Body?.transformToString();
      if (!text) return { days: [] };
      try {
        const j = JSON.parse(text) as FileShape;
        if (j && Array.isArray(j.days)) return j;
        throw new StoreError("corrupt_record", "drift-history.json missing days array");
      } catch (parseErr) {
        if (parseErr instanceof StoreError) throw parseErr;
        throw new StoreError("corrupt_record", "drift-history.json failed to parse", parseErr);
      }
    } catch (err: unknown) {
      if (err instanceof StoreError) throw err;
      if ((err as { name?: string }).name === "NoSuchKey") return { days: [] };
      console.error("[drift-history/spaces] Failed to load:", err);
      throw new StoreError("unavailable", "Spaces read failed", err);
    }
    return { days: [] };
  }

  private async persist(data: FileShape): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: KEY,
          Body: JSON.stringify(data, null, 2),
          ContentType: "application/json",
        }),
      );
    } catch (err) {
      console.error("[drift-history/spaces] Failed to persist:", err);
      throw new StoreError("unavailable", "Spaces write failed", err);
    }
  }

  async recordDay(count: number): Promise<void> {
    if (count < 0) return;
    const data = await this.load();
    const ymd = new Date().toISOString().slice(0, 10);
    const last = data.days[data.days.length - 1];
    if (last?.ymd === ymd) {
      last.totalNewFindings += count;
    } else {
      data.days.push({ ymd, totalNewFindings: count });
    }
    if (data.days.length > 60) data.days = data.days.slice(-60);
    await this.persist(data);
  }

  async getDays(): Promise<DayEntry[]> {
    return (await this.load()).days;
  }
}
