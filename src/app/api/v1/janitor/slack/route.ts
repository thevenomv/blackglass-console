/**
 * POST /api/v1/janitor/slack — Slack interactivity (Block Kit) for Charon cleanup approve/reject.
 *
 * Requires SLACK_SIGNING_SECRET. Verifies `X-Slack-Signature` + replay window.
 * Button `value` must be the janitor cleanup request UUID.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { withBypassRls } from "@/db";
import { janitorCleanupRequests, saasSubscriptions } from "@/db/schema";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import {
  approveOrRejectJanitorCleanup,
  JanitorCleanupExecutionError,
} from "@/lib/server/services/janitor-cleanup-service";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySlackSignature(opts: {
  signingSecret: string;
  rawBody: string;
  timestamp: string;
  signature: string;
}): boolean {
  const ts = parseInt(opts.timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 5) return false;
  const base = `v0:${opts.timestamp}:${opts.rawBody}`;
  const hmac = crypto.createHmac("sha256", opts.signingSecret).update(base).digest("hex");
  const expected = `v0=${hmac}`;
  return timingSafeEqual(opts.signature, expected);
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return Response.json(
      { error: "not_configured", detail: "SLACK_SIGNING_SECRET is not set." },
      { status: 501, headers: { "x-request-id": requestId } },
    );
  }

  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";
  const rawBody = await request.text();

  if (!verifySlackSignature({ signingSecret, rawBody, timestamp, signature })) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return Response.json({ error: "expected_form_payload" }, { status: 400 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    actions?: { action_id?: string; value?: string }[];
    user?: { id?: string };
  };
  try {
    payload = JSON.parse(payloadRaw) as typeof payload;
  } catch {
    return Response.json({ error: "invalid_payload_json" }, { status: 400 });
  }

  if (payload.type === "url_verification" && payload.challenge) {
    return Response.json({ challenge: payload.challenge });
  }

  const action = payload.actions?.[0];
  const requestRowId = action?.value?.trim();
  const actionId = action?.action_id;
  if (!requestRowId || !actionId) {
    return Response.json({ error: "missing_action" }, { status: 400 });
  }

  let approve: boolean;
  if (actionId === "charon_cleanup_approve") approve = true;
  else if (actionId === "charon_cleanup_reject") approve = false;
  else {
    return Response.json({ error: "unknown_action" }, { status: 400 });
  }

  const slackUser = payload.user?.id ?? "unknown";

  const lookup = await withBypassRls(async (db) => {
    const [row] = await db
      .select({
        tenantId: janitorCleanupRequests.tenantId,
        id: janitorCleanupRequests.id,
      })
      .from(janitorCleanupRequests)
      .where(eq(janitorCleanupRequests.id, requestRowId))
      .limit(1);
    if (!row) return { kind: "not_found" as const };
    const [sub] = await db
      .select({ planCode: saasSubscriptions.planCode, features: saasSubscriptions.features })
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.tenantId, row.tenantId))
      .limit(1);
    if (!sub) return { kind: "no_subscription" as const };
    return { kind: "ok" as const, tenantId: row.tenantId, planCode: sub.planCode, features: sub.features };
  });

  if (lookup.kind === "not_found") {
    return Response.json({
      response_type: "ephemeral",
      text: "Cleanup request not found (or already processed).",
    });
  }
  if (lookup.kind === "no_subscription") {
    return Response.json({
      response_type: "ephemeral",
      text: "Workspace has no subscription record.",
    });
  }

  const ent = resolveCharonEntitlements(lookup.planCode, {
    charonAddon: isCharonAddonEnabled(lookup.features),
  });

  try {
    await approveOrRejectJanitorCleanup(
      lookup.tenantId,
      requestRowId,
      approve ? "approve" : "reject",
      `slack:${slackUser}`,
      { liveCleanupAllowed: ent.liveCleanup },
    );
  } catch (e) {
    const detail =
      e instanceof JanitorCleanupExecutionError
        ? e.redactedDetail
        : e instanceof Error
          ? e.message
          : String(e);
    return Response.json({
      response_type: "ephemeral",
      text: `Could not apply action: ${detail}`,
    });
  }

  return Response.json({
    response_type: "ephemeral",
    text: approve ? "Approved." : "Rejected.",
  });
}
