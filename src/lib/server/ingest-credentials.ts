import { randomBytes } from "node:crypto";

export function parseHostIngestKeys(): Record<string, string> {
  const raw = process.env.INGEST_HOST_KEYS_JSON?.trim();
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.length > 0) out[String(k)] = v;
    }
    return out;
  } catch {
    console.warn("[ingest] INGEST_HOST_KEYS_JSON parse failed");
    return {};
  }
}

export function maskSecret(secret: string): string {
  const t = secret.trim();
  if (!t) return "";
  if (t.length <= 12) return `${t.slice(0, 3)}••••••••`;
  return `${t.slice(0, 7)}…${t.slice(-4)}`;
}

export type IngestCredentialSummary = {
  pushIngestConfigured: boolean;
  sharedKeyMasked: string | null;
  perHostKeyCount: number;
  mode: "none" | "shared_only" | "per_host_only" | "shared_and_per_host";
};

export function getIngestCredentialSummary(): IngestCredentialSummary {
  const shared = process.env.INGEST_API_KEY?.trim() ?? "";
  const hostMap = parseHostIngestKeys();
  const perHostKeyCount = Object.keys(hostMap).length;
  const hasShared = shared.length > 0;

  let mode: IngestCredentialSummary["mode"] = "none";
  if (hasShared && perHostKeyCount > 0) mode = "shared_and_per_host";
  else if (hasShared) mode = "shared_only";
  else if (perHostKeyCount > 0) mode = "per_host_only";

  return {
    pushIngestConfigured: hasShared || perHostKeyCount > 0,
    sharedKeyMasked: hasShared ? maskSecret(shared) : null,
    perHostKeyCount,
    mode,
  };
}

export function generateIngestApiKey(): string {
  return `bg_live_${randomBytes(24).toString("base64url")}`;
}
