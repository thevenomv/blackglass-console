/**
 * Live Charon cleanup against cloud APIs (DO, AWS, GCP).
 */

import { deleteDroplet, deleteSnapshot, deleteVolume } from "@/lib/server/janitor/do-client";
import { performAwsLiveCleanup } from "@/lib/server/janitor/aws-cleanup";
import { performGcpLiveCleanup } from "@/lib/server/janitor/gcp-cleanup";
import { decryptKey, type EncryptedKey } from "@/lib/server/secrets/envelope";
import type { JanitorFinding } from "@/db/schema";

function parseEncryptedKey(raw: string): EncryptedKey {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed) as EncryptedKey;
  if (!parsed?.ciphertext || parsed.wrappedDek === undefined || !parsed.kmsProvider) {
    throw new Error("invalid_encrypted_key_blob");
  }
  return parsed;
}

async function decryptApiToken(tenantId: string, encryptedApiKey: string): Promise<string> {
  const enc = parseEncryptedKey(encryptedApiKey);
  const buf = await decryptKey(tenantId, enc);
  try {
    return buf.toString("utf8").trim();
  } finally {
    buf.fill(0);
  }
}

export async function performDigitalOceanLiveCleanup(
  tenantId: string,
  encryptedApiKey: string,
  finding: JanitorFinding,
): Promise<void> {
  const token = await decryptApiToken(tenantId, encryptedApiKey);
  const rt = finding.resourceType;

  if (rt === "droplet") {
    const id = Number(finding.resourceId);
    if (!Number.isFinite(id)) throw new Error("invalid_droplet_id");
    await deleteDroplet(token, id);
    return;
  }

  if (rt === "volume") {
    const meta = finding.metricsMeta as { region?: string } | null | undefined;
    const region = typeof meta?.region === "string" ? meta.region : "";
    if (!region.trim()) throw new Error("volume_region_required");
    await deleteVolume(token, finding.resourceId, region);
    return;
  }

  if (rt === "snapshot") {
    await deleteSnapshot(token, finding.resourceId);
    return;
  }

  throw new Error("cleanup_resource_type_unsupported");
}

export async function performLiveJanitorCleanup(
  tenantId: string,
  provider: string,
  encryptedApiKey: string,
  finding: JanitorFinding,
): Promise<void> {
  if (provider === "do") {
    return performDigitalOceanLiveCleanup(tenantId, encryptedApiKey, finding);
  }
  if (provider === "aws") {
    const raw = await decryptApiToken(tenantId, encryptedApiKey);
    return performAwsLiveCleanup(raw, finding);
  }
  if (provider === "gcp") {
    const raw = await decryptApiToken(tenantId, encryptedApiKey);
    return performGcpLiveCleanup(raw, finding);
  }
  throw new Error("live_cleanup_provider_unsupported");
}
