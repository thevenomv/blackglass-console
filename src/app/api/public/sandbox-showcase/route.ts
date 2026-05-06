/**
 * GET /api/public/sandbox-showcase
 *
 * Returns live state from the shared showcase sandbox — a Blackglass-owned
 * Droplet that is always running with drift seeded on a rolling schedule.
 *
 * PUBLIC — no auth required. Rate-limited by IP.
 * Data is read-only and scoped to SANDBOX_SHOWCASE_TENANT_ID.
 *
 * Environment variables:
 *   SANDBOX_SHOWCASE_TENANT_ID — UUID of the showcase tenant row
 *                                 (set in Doppler; omitting disables the endpoint)
 *
 * Response shape:
 *   {
 *     status: "online" | "provisioning" | "unavailable",
 *     sandbox: SaasSandbox | null,
 *     recentEvents: ShowcaseEvent[],
 *   }
 */

import { NextResponse } from "next/server";
import { withBypassRls, schema } from "@/db";
import { eq, and, ne, desc } from "drizzle-orm";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Drift scene descriptions for each seed phase (matches sandbox-seed.sh)
const SCENE_LABELS: Record<number, { title: string; category: string; severity: string }> = {
  1: { title: "Backdoor port listener on TCP 4444", category: "LISTENERS", severity: "high" },
  2: { title: "NOPASSWD sudoers entry added", category: "SUDOERS", severity: "critical" },
  3: { title: "Rogue user account 'attacker-ssh' created", category: "USERS", severity: "high" },
  4: { title: "Rogue user added to sudo group", category: "SUDO_GROUP", severity: "critical" },
  5: { title: "sshd PermitRootLogin changed to yes", category: "SSH_CONFIG", severity: "critical" },
  6: { title: "Cron backdoor to external C2 added", category: "CRON", severity: "critical" },
  7: { title: "SUID binary planted in /usr/local/bin", category: "FILE_INTEGRITY", severity: "high" },
  8: { title: "World-writable /etc/passwd", category: "FILE_INTEGRITY", severity: "critical" },
};

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  const tenantId = process.env.SANDBOX_SHOWCASE_TENANT_ID?.trim();
  if (!tenantId) {
    return NextResponse.json(
      { status: "unavailable", sandbox: null, recentEvents: [] },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } },
    );
  }

  const { saasSandboxes } = schema;

  const [sandbox] = await withBypassRls((db) =>
    db
      .select({
        id: saasSandboxes.id,
        status: saasSandboxes.status,
        dropletIp: saasSandboxes.dropletIp,
        region: saasSandboxes.region,
        seedPhase: saasSandboxes.seedPhase,
        driftSeededAt: saasSandboxes.driftSeededAt,
        ttlExpiresAt: saasSandboxes.ttlExpiresAt,
        createdAt: saasSandboxes.createdAt,
      })
      .from(saasSandboxes)
      .where(
        and(
          eq(saasSandboxes.tenantId, tenantId),
          ne(saasSandboxes.status, "destroyed"),
        ),
      )
      .orderBy(desc(saasSandboxes.createdAt))
      .limit(1),
  );

  if (!sandbox) {
    return NextResponse.json(
      { status: "unavailable", sandbox: null, recentEvents: [] },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } },
    );
  }

  // Build event list from phases applied so far — most recent first
  const recentEvents = Array.from(
    { length: sandbox.seedPhase },
    (_, i) => {
      const phase = sandbox.seedPhase - i;
      const scene = SCENE_LABELS[phase];
      return scene
        ? { phase, ...scene, detectedAt: sandbox.driftSeededAt }
        : null;
    },
  ).filter(Boolean);

  const status =
    sandbox.status === "ready" || sandbox.status === "seeding"
      ? "online"
      : "provisioning";

  return NextResponse.json(
    {
      status,
      sandbox: {
        id: sandbox.id,
        status: sandbox.status,
        region: sandbox.region,
        seedPhase: sandbox.seedPhase,
        driftSeededAt: sandbox.driftSeededAt,
        ttlExpiresAt: sandbox.ttlExpiresAt,
      },
      recentEvents,
    },
    {
      headers: {
        "x-request-id": requestId,
        // Short cache — this is live data but polling every few seconds is fine
        "Cache-Control": "no-store",
      },
    },
  );
}
