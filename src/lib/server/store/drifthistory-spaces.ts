import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DayEntry, DriftHistoryRepository } from "./types";

const KEY = "drift-history.json";
type FileShape = { days: DayEntry[] };

export class SpacesDriftHistoryRepository implements DriftHistoryRepository {
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
        new GetObjectCommand({ Bucket: this.bucket, Key }),
      );
      const text = await resp.Body?.transformToString();
      if (!text) return { days: [] };
      const j = JSON.parse(text) as FileShape;
      if (j && Array.isArray(j.days)) return j;
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "NoSuchKey") {
        console.error("[drift-history/spaces] Failed to load:", err);
      }
    }
    return { days: [] };
  }

  private async persist(data: FileShape): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key,
          Body: JSON.stringify(data, null, 2),
          ContentType: "application/json",
        }),
      );
    } catch (err) {
      console.error("[drift-history/spaces] Failed to persist:", err);
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
