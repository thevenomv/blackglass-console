/**
 * Billing provisioning: flip the BLACKGLASS_PLAN env var on the DigitalOcean
 * app when a Stripe subscription is created or cancelled.
 *
 * This is intentionally simple: no database, no user table.  The single-tenant
 * app runs with one plan at a time, driven by the BLACKGLASS_PLAN env var.
 * When multi-tenancy is added, replace the DO API calls with DB writes and
 * remove this module.
 *
 * Required env vars (all set via Doppler / DO app env):
 *   DO_API_TOKEN  — DigitalOcean personal access token
 *   DO_APP_ID     — DigitalOcean App Platform app ID
 */

import type { Plan } from "@/lib/plan";

interface StripeContext {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DO_API = "https://api.digitalocean.com/v2";

function doHeaders() {
  const token = process.env.DO_API_TOKEN;
  if (!token) throw new Error("DO_API_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getCurrentSpec(): Promise<Record<string, unknown>> {
  const appId = process.env.DO_APP_ID;
  if (!appId) throw new Error("DO_APP_ID is not set");

  const res = await fetch(`${DO_API}/apps/${appId}`, { headers: doHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DO GET app failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { app: { spec: Record<string, unknown> } };
  return data.app.spec;
}

async function setAppPlan(plan: Plan, _ctx: StripeContext): Promise<void> {
  const appId = process.env.DO_APP_ID;
  if (!appId) throw new Error("DO_APP_ID is not set");

  const spec = await getCurrentSpec();

  // Replace or insert BLACKGLASS_PLAN in the global envs array.
  const existingEnvs = (spec.envs as Array<Record<string, string>> | undefined) ?? [];
  const withoutPlan = existingEnvs.filter((e) => e.key !== "BLACKGLASS_PLAN");
  spec.envs = [
    ...withoutPlan,
    { key: "BLACKGLASS_PLAN", value: plan, scope: "RUN_TIME", type: "GENERAL" },
  ];

  const res = await fetch(`${DO_API}/apps/${appId}`, {
    method: "PUT",
    headers: doHeaders(),
    body: JSON.stringify({ spec }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DO PUT app failed ${res.status}: ${text}`);
  }

  console.info(`[provision] BLACKGLASS_PLAN set to "${plan}" on DO app ${appId}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function provisionPlan(plan: Plan, ctx: StripeContext): Promise<void> {
  try {
    await setAppPlan(plan, ctx);
  } catch (err) {
    // Log but don't re-throw: webhook must return 200 or Stripe will retry.
    console.error("[provision] Failed to provision plan:", err);
  }
}

export async function deprovisionPlan(ctx: StripeContext): Promise<void> {
  try {
    await setAppPlan("free", ctx);
  } catch (err) {
    console.error("[provision] Failed to deprovision plan:", err);
  }
}
