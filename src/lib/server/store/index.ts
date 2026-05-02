/**
 * Persistence adapter factory.
 *
 * Priority for both baselines and drift history:
 *  1. Spaces — when DO_SPACES_KEY + DO_SPACES_SECRET + DO_SPACES_BUCKET + DO_SPACES_ENDPOINT are set
 *  2. Filesystem — when BASELINE_STORE_PATH / DRIFT_HISTORY_PATH are set (local dev / Docker)
 *  3. Memory — default (CI / local dev without env vars); ephemeral
 */
import type { BaselineRepository, DriftHistoryRepository } from "./types";
import { MemoryBaselineRepository } from "./baseline-memory";
import { FilesystemBaselineRepository } from "./baseline-fs";
import { SpacesBaselineRepository } from "./baseline-spaces";
import { MemoryDriftHistoryRepository } from "./drifthistory-memory";
import { FilesystemDriftHistoryRepository } from "./drifthistory-fs";
import { SpacesDriftHistoryRepository } from "./drifthistory-spaces";

type SpacesConfig = {
  key: string;
  secret: string;
  bucket: string;
  endpoint: string;
  region: string;
};

function spacesConfig(): SpacesConfig | null {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const bucket = process.env.DO_SPACES_BUCKET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  if (!key || !secret || !bucket || !endpoint) return null;
  // Derive region from the subdomain of the endpoint URL when not explicitly set
  const region = process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
  return { key, secret, bucket, endpoint, region };
}

// Process-global singletons — survive Next.js hot-reload
const BASELINE_KEY = "__blackglass_baseline_repo_v2" as const;
const DRIFT_KEY = "__blackglass_drift_repo_v2" as const;
type G = typeof globalThis & {
  [BASELINE_KEY]?: BaselineRepository;
  [DRIFT_KEY]?: DriftHistoryRepository;
};

export function getBaselineRepository(): BaselineRepository {
  const g = globalThis as G;
  if (!g[BASELINE_KEY]) {
    const sp = spacesConfig();
    if (sp) {
      g[BASELINE_KEY] = new SpacesBaselineRepository(
        sp.bucket, sp.key, sp.secret, sp.endpoint, sp.region,
      );
    } else if (process.env.BASELINE_STORE_PATH) {
      g[BASELINE_KEY] = new FilesystemBaselineRepository(process.env.BASELINE_STORE_PATH);
    } else {
      g[BASELINE_KEY] = new MemoryBaselineRepository();
    }
  }
  return g[BASELINE_KEY];
}

export function getDriftHistoryRepository(): DriftHistoryRepository {
  const g = globalThis as G;
  if (!g[DRIFT_KEY]) {
    const sp = spacesConfig();
    if (sp) {
      g[DRIFT_KEY] = new SpacesDriftHistoryRepository(
        sp.bucket, sp.key, sp.secret, sp.endpoint, sp.region,
      );
    } else if (process.env.DRIFT_HISTORY_PATH) {
      g[DRIFT_KEY] = new FilesystemDriftHistoryRepository(process.env.DRIFT_HISTORY_PATH);
    } else {
      g[DRIFT_KEY] = new MemoryDriftHistoryRepository();
    }
  }
  return g[DRIFT_KEY];
}
