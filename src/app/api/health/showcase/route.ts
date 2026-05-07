/**
 * GET /api/health/showcase
 *
 * Operator-grade health probe for the public sandbox showcase
 * (https://blackglasssec.com/demo/sandbox).
 *
 * Why this exists, separate from /api/public/sandbox-showcase:
 *   - The public route is permissive — it returns `status: "provisioning"`
 *     even when an in-process auto-provision attempt has failed and the
 *     sandbox row is in `error` state. That's the right UX for the demo
 *     page (it makes the page self-healing) but the wrong signal for an
 *     uptime monitor: a perpetual "provisioning" spinner means the
 *     showcase is silently broken.
 *   - This endpoint flips that on its head: it returns 200 ONLY when the
 *     sandbox is genuinely healthy (status='ready' or 'seeding', within
 *     TTL, has a Droplet ID). Anything else is 503 with a structured
 *     reason — something a monitor (DO Uptime, Pingdom, Sentry Cron, etc.)
 *     can alert on without false positives.
 *
 * The endpoint is intentionally unauthenticated (same reasoning as
 * /api/health and /api/health/airgap): monitoring infra cannot always
 * carry credentials, and the response contains no secrets — only
 * sandbox status, region, droplet ID, TTL, and seed phase.
 *
 * On failure paths the handler emits a Sentry breadcrumb so that an alert
 * in Sentry's UI carries the same diagnostic context as the HTTP body.
 */

import { NextResponse } from "next/server";
import { withBypassRls, schema } from "@/db";
import { and, desc, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status =
  | "ok"
  | "disabled"
  | "no_sandbox"
  | "provisioning"
  | "expired"
  | "error"
  | "db_unavailable";

interface Body {
  status: Status;
  /** Suitable for a status-page bullet ("Online" / "Provisioning" / etc.). */
  label: string;
  /** Sandbox state. Null when no sandbox row exists for the showcase tenant. */
  sandbox: null | {
    id: string;
    status: string;
    region: string;
    seedPhase: number;
    hasDroplet: boolean;
    ttlExpiresAt: string | null;
    secondsUntilExpiry: number | null;
    /** Truncated to 240 chars to keep the body monitor-friendly. */
    errorMessage: string | null;
  };
  /** Best-effort hint for what an operator would do next. Never includes secrets. */
  hint?: string;
}

async function emitSentryBreadcrumb(level: "info" | "warning" | "error", body: Body) {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.addBreadcrumb({
      category: "health.showcase",
      level,
      message: `showcase ${body.status}`,
      data: {
        status: body.status,
        sandbox_status: body.sandbox?.status,
        seed_phase: body.sandbox?.seedPhase,
        has_droplet: body.sandbox?.hasDroplet,
        seconds_until_expiry: body.sandbox?.secondsUntilExpiry,
      },
    });
  } catch {
    // Sentry optional in self-hosted / dev runtimes.
  }
}

/**
 * Always returns HTTP 200. The semantic status lives in `body.status` and the
 * `X-Showcase-Status` header. This is intentional: DO App Platform's edge
 * intercepts ANY origin 5xx response and replaces the JSON body with its own
 * HTML "service unavailable" page (we discovered this the hard way during
 * the 2026-05-07 showcase incident — see docs/runbooks/operations.md §4b).
 *
 * Health monitors should alert on `body.status !== "ok"` (or check
 * `X-Showcase-Status`), not on the HTTP status code.
 */
function respond(body: Body, _semantic: 200 | 503) {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Showcase-Status": body.status,
      // Mirrors `_semantic` so callers/dashboards can still see what the
      // route considered a failure even though the wire status is 200.
      "X-Showcase-Severity": _semantic === 200 ? "ok" : "degraded",
    },
  });
}

export async function GET() {
  const tenantId = process.env.SANDBOX_SHOWCASE_TENANT_ID?.trim();

  if (!tenantId) {
    const body: Body = {
      status: "disabled",
      label: "Showcase disabled (env)",
      sandbox: null,
      hint: "Set SANDBOX_SHOWCASE_TENANT_ID on the web service to enable the demo.",
    };
    await emitSentryBreadcrumb("info", body);
    // 200 because "disabled" is a known operator choice, not a failure to
    // be paged on. Monitors can alert on `status != "ok"` if they want.
    return respond(body, 200);
  }

  const { saasSandboxes } = schema;

  let sandbox: typeof saasSandboxes.$inferSelect | undefined;
  try {
    [sandbox] = await withBypassRls((db) =>
      db
        .select()
        .from(saasSandboxes)
        .where(and(eq(saasSandboxes.tenantId, tenantId), ne(saasSandboxes.status, "destroyed")))
        .orderBy(desc(saasSandboxes.createdAt))
        .limit(1),
    );
  } catch (err) {
    const body: Body = {
      status: "db_unavailable",
      label: "Showcase DB query failed",
      sandbox: null,
      hint: err instanceof Error ? err.message.slice(0, 200) : "unknown DB error",
    };
    await emitSentryBreadcrumb("error", body);
    return respond(body, 503);
  }

  if (!sandbox) {
    const body: Body = {
      status: "no_sandbox",
      label: "No sandbox row — auto-provision will trigger on next page load",
      sandbox: null,
      hint: "Hit /api/public/sandbox-showcase to kick auto-provision (throttled to once per 60s).",
    };
    await emitSentryBreadcrumb("warning", body);
    return respond(body, 503);
  }

  const ttlExpiresAt = sandbox.ttlExpiresAt ? new Date(sandbox.ttlExpiresAt) : null;
  const now = new Date();
  const secondsUntilExpiry = ttlExpiresAt ? Math.round((ttlExpiresAt.getTime() - now.getTime()) / 1000) : null;
  const expired = secondsUntilExpiry !== null && secondsUntilExpiry < 0;
  const errorMessage = sandbox.errorMessage?.slice(0, 240) ?? null;

  const sandboxView = {
    id: sandbox.id,
    status: sandbox.status,
    region: sandbox.region,
    seedPhase: sandbox.seedPhase,
    hasDroplet: Boolean(sandbox.dropletId),
    ttlExpiresAt: ttlExpiresAt?.toISOString() ?? null,
    secondsUntilExpiry,
    errorMessage,
  };

  if (sandbox.status === "error") {
    const body: Body = {
      status: "error",
      label: "Sandbox in error state — provisioning failed",
      sandbox: sandboxView,
      hint: errorMessage ?? "Check the most recent /api/public/sandbox-showcase logs.",
    };
    await emitSentryBreadcrumb("error", body);
    return respond(body, 503);
  }

  if (expired) {
    const body: Body = {
      status: "expired",
      label: "Sandbox TTL has elapsed — Droplet may be reclaimed",
      sandbox: sandboxView,
      hint: "Sandbox-worker normally destroys + replaces; without it, mark destroyed manually.",
    };
    await emitSentryBreadcrumb("warning", body);
    return respond(body, 503);
  }

  if (sandbox.status === "ready" || sandbox.status === "seeding") {
    const body: Body = {
      status: "ok",
      label:
        sandbox.status === "ready"
          ? `Online (seed ${sandbox.seedPhase}/8)`
          : `Seeding (phase ${sandbox.seedPhase}/8)`,
      sandbox: sandboxView,
    };
    await emitSentryBreadcrumb("info", body);
    return respond(body, 200);
  }

  // 'provisioning' or any unknown intermediate status
  const body: Body = {
    status: "provisioning",
    label: `Provisioning (sandbox.status=${sandbox.status})`,
    sandbox: sandboxView,
    hint: "Droplet creation in progress; if this persists >5 min the in-process activator likely died.",
  };
  await emitSentryBreadcrumb("warning", body);
  return respond(body, 503);
}
