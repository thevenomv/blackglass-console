/**
 * Report store with optional Spaces persistence.
 *
 * Report metadata (index) is written to `reports/index.json` in the Spaces
 * bucket.  Report content (the JSON payload) is written to
 * `reports/{id}.json`.  Both operations are fire-and-forget so they never
 * block the HTTP response.
 *
 * If DO_SPACES_* variables are absent the store falls back to the in-process
 * global (same behaviour as before — nothing breaks in local dev).
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportEntry = {
  id: string;
  title: string;
  scope: string;
  generatedAt: string;
  status: "ready" | "generating" | "failed";
  /** Set when status is 'failed'; a short human-readable reason. */
  failReason?: string;
  format: "markdown" | "pdf";
};

// ---------------------------------------------------------------------------
// In-process fallback (used when Spaces not configured, and as a write-through
// cache so reads don't always hit Spaces)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__blackglass_reports_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: ReportEntry[] };

function memStore(): ReportEntry[] {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = [];
  return g[GLOBAL_KEY];
}

const SIDECAR_KEY = "__blackglass_report_content_v1" as const;
type GS = typeof globalThis & { [SIDECAR_KEY]?: Record<string, string> };

function memSidecar(): Record<string, string> {
  const g = globalThis as GS;
  if (!g[SIDECAR_KEY]) g[SIDECAR_KEY] = {};
  return g[SIDECAR_KEY];
}

// ---------------------------------------------------------------------------
// S3/Spaces helpers
// ---------------------------------------------------------------------------

const INDEX_KEY = "reports/index.json";

function makeClient(): S3Client | null {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  if (!key || !secret || !endpoint) return null;
  const region =
    process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

function bucket(): string {
  return process.env.DO_SPACES_BUCKET ?? "";
}

async function readJsonFromSpaces<T>(client: S3Client, key: string): Promise<T | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch {
    return null;
  }
}

async function writeJsonToSpaces(client: S3Client, key: string, value: unknown): Promise<void> {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: JSON.stringify(value),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.error(`[report-store] Failed to write ${key} to Spaces:`, err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all report entries.  On first call after a cold start, loads the index
 * from Spaces to populate the in-process cache.
 */
export async function listReports(): Promise<ReportEntry[]> {
  const mem = memStore();
  if (mem.length === 0) {
    const client = makeClient();
    if (client) {
      const persisted = await readJsonFromSpaces<ReportEntry[]>(client, INDEX_KEY);
      if (persisted && Array.isArray(persisted)) {
        mem.splice(0, mem.length, ...persisted);
      }
    }
  }
  return mem;
}

/**
 * Add a report entry to the in-process store and persist the index to Spaces.
 */
export function addReport(entry: ReportEntry): void {
  memStore().unshift(entry);
  void persistIndex();
}

/**
 * Update a report entry's status and/or any fields.  Persists index afterward.
 */
export function updateReport(id: string, patch: Partial<ReportEntry>): void {
  const entry = memStore().find((r) => r.id === id);
  if (entry) Object.assign(entry, patch);
  void persistIndex();
}

/**
 * Get the full report content for a given report ID.
 * Tries the in-process sidecar first, then falls back to Spaces.
 */
export async function getReportContent(id: string): Promise<string | null> {
  const mem = memSidecar();
  if (mem[id]) return mem[id];
  const client = makeClient();
  if (!client) return null;
  const content = await readJsonFromSpaces<unknown>(client, `reports/${id}.json`);
  if (content) {
    const str = JSON.stringify(content, null, 2);
    mem[id] = str;
    return str;
  }
  return null;
}

/**
 * Store the full report content (both in-process and Spaces).
 */
export async function saveReportContent(id: string, content: string): Promise<void> {
  memSidecar()[id] = content;
  const client = makeClient();
  if (client) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = content;
    }
    await writeJsonToSpaces(client, `reports/${id}.json`, parsed);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function persistIndex(): Promise<void> {
  const client = makeClient();
  if (!client) return;
  // Only keep the 50 most recent to cap index size
  const index = memStore().slice(0, 50);
  await writeJsonToSpaces(client, INDEX_KEY, index);
}
