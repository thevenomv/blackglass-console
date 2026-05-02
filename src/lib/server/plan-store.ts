/**
 * Plan state store.
 *
 * Persists BLACKGLASS_PLAN to the same Spaces bucket used for baselines so
 * Stripe webhook events can flip the plan without triggering a DO App Platform
 * redeployment.
 *
 * Read path (synchronous — safe for server components):
 *   getActivePlan() — returns cached value; BLACKGLASS_PLAN env as fallback.
 *
 * Write path (async — called from webhook handler):
 *   setAndPersistPlan(plan) — updates in-memory cache AND writes to Spaces.
 *
 * Refresh: call refreshPlanFromSpaces() from any async context (e.g. /api/health)
 *   to pull the latest value from Spaces when the TTL has elapsed.  This lets a
 *   plan change written by one container instance propagate to others within one TTL.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Plan } from "@/lib/plan";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PlanState = {
  plan: Plan;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// S3/Spaces helpers
// ---------------------------------------------------------------------------

const PLAN_KEY = "plans/active.json";
const VALID_PLANS: Plan[] = ["free", "pro", "enterprise"];
const CACHE_TTL_MS = 60_000; // refresh from Spaces at most once per minute

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

// ---------------------------------------------------------------------------
// Process-global cache (survives Next.js hot-reload)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__blackglass_plan_cache_v1" as const;
type G = typeof globalThis & {
  [GLOBAL_KEY]?: {
    plan: Plan;
    expiresAt: number;
  };
};

function envPlan(): Plan {
  const raw = process.env.BLACKGLASS_PLAN?.toLowerCase().trim() as Plan | undefined;
  return raw && VALID_PLANS.includes(raw) ? raw : "free";
}

function cache() {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { plan: envPlan(), expiresAt: 0 };
  }
  return g[GLOBAL_KEY];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Synchronous — reads from in-memory cache; falls back to env. */
export function getActivePlan(): Plan {
  return cache().plan;
}

/** Update the in-memory cache (also call persistPlanToSpaces for durability). */
export function setCachedPlan(plan: Plan): void {
  const c = cache();
  c.plan = plan;
  c.expiresAt = Date.now() + CACHE_TTL_MS;
}

/** Write plan state to Spaces (no redeployment required). */
export async function persistPlanToSpaces(plan: Plan): Promise<void> {
  const client = makeClient();
  if (!client) {
    console.warn("[plan-store] Spaces not configured — plan persisted in memory only");
    return;
  }
  const body: PlanState = { plan, updatedAt: new Date().toISOString() };
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: PLAN_KEY,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json",
    }),
  );
}

/** Read plan from Spaces and update cache. No-ops if Spaces not configured. */
export async function refreshPlanFromSpaces(): Promise<void> {
  const c = cache();
  if (Date.now() < c.expiresAt) return; // still fresh

  const client = makeClient();
  if (!client) return;

  try {
    const resp = await client.send(
      new GetObjectCommand({ Bucket: bucket(), Key: PLAN_KEY }),
    );
    const text = await resp.Body?.transformToString();
    if (!text) return;
    const state = JSON.parse(text) as PlanState;
    if (VALID_PLANS.includes(state.plan)) {
      c.plan = state.plan;
    }
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NoSuchKey") return; // not written yet
    console.error("[plan-store] Failed to refresh plan from Spaces:", err);
  } finally {
    c.expiresAt = Date.now() + CACHE_TTL_MS;
  }
}

/**
 * Convenience: update cache + persist to Spaces in one call.
 * Use this from Stripe webhook handlers.
 */
export async function setAndPersistPlan(plan: Plan): Promise<void> {
  setCachedPlan(plan);
  await persistPlanToSpaces(plan);
}
