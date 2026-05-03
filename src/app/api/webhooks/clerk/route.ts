import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { tryGetDb } from "@/db";
import { checkClerkWebhookRate, clientIpFromHeaders } from "@/lib/server/rate-limit";
import {
  deleteMembership,
  ensureTenantForClerkOrg,
  getTenantRowByClerkOrg,
  parseMembershipRole,
  upsertMembership,
  cancelTenantByClerkOrg,
  deleteAllMembershipsForUser,
} from "@/lib/saas/tenant-service";
import { claimWebhookEvent } from "@/lib/saas/webhook-idempotency";
import { emitSaasAudit, emitSaasSecurity } from "@/lib/saas/event-log";
import { clerkClient } from "@clerk/nextjs/server";
import type { TenantRole } from "@/lib/saas/tenant-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClerkOrgEvt = {
  id: string;
  name?: string;
};

type ClerkMemEvt = {
  id?: string;
  organization: ClerkOrgEvt;
  public_user_data?: { user_id?: string };
  public_metadata?: unknown;
  role?: string;
};

function readOrgName(data: Record<string, unknown>): string {
  const name = data.name;
  return typeof name === "string" ? name : "Workspace";
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 });
  }

  const payload = await request.text();
  const h = await headers();

  const ip = clientIpFromHeaders(h);
  if (!(await checkClerkWebhookRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  const id = h.get("svix-id");
  const ts = h.get("svix-timestamp");
  const sig = h.get("svix-signature");
  if (!id || !ts || !sig) {
    return NextResponse.json({ error: "missing_svix_headers" }, { status: 400 });
  }

  let evt: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig }) as {
      type: string;
      data: Record<string, unknown>;
    };
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!tryGetDb()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  if (!(await claimWebhookEvent("clerk", id))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    switch (evt.type) {
      case "organization.created": {
        const orgId = typeof evt.data.id === "string" ? evt.data.id : "";
        if (orgId) {
          const tenant = await ensureTenantForClerkOrg(orgId, readOrgName(evt.data));
          const client = await clerkClient();
          const existing = await client.organizations.getOrganization({ organizationId: orgId });
          const pub = (existing.publicMetadata ?? {}) as Record<string, unknown>;
          await client.organizations.updateOrganization(orgId, {
            publicMetadata: { ...pub, saas_tenant_id: tenant.id },
          });
          await emitSaasAudit({
            tenantId: tenant.id,
            actorUserId: null,
            action: "tenant.provisioned",
            targetType: "organization",
            targetId: orgId,
            metadata: { source: "clerk_webhook" },
          });
        }
        break;
      }
      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const d = evt.data as unknown as ClerkMemEvt;
        const orgId = d.organization?.id;
        const userId =
          d.public_user_data?.user_id ??
          (typeof evt.data.user_id === "string" ? evt.data.user_id : undefined);
        if (!orgId || !userId) break;
        let role: TenantRole = parseMembershipRole(d.public_metadata);
        if (role === "viewer" && d.role === "org:admin") {
          role = "owner";
        }
        const tenantId = await upsertMembership({
          clerkOrgId: orgId,
          orgName: d.organization?.name ?? "Workspace",
          userId,
          role,
          invitedBy: null,
        });
        await emitSaasAudit({
          tenantId,
          actorUserId: userId,
          action: evt.type === "organizationMembership.created" ? "member.synced" : "member.updated",
          targetType: "user",
          targetId: userId,
          metadata: { clerkEvent: evt.type, role },
        });
        break;
      }
      case "organizationMembership.deleted": {
        const d = evt.data as unknown as ClerkMemEvt;
        const orgId = d.organization?.id;
        const userId =
          d.public_user_data?.user_id ??
          (typeof evt.data.user_id === "string" ? evt.data.user_id : undefined);
        if (orgId && userId) {
          if (tryGetDb()) {
            const rows = await getTenantRowByClerkOrg(orgId);
            const tenantId = rows[0]?.id;
            if (tenantId) {
              await emitSaasAudit({
                tenantId,
                actorUserId: userId,
                action: "member.removed",
                targetType: "user",
                targetId: userId,
                metadata: { clerkEvent: evt.type },
              });
            }
            await deleteMembership(orgId, userId);
          }
        }
        break;
      }
      case "organization.deleted": {
        // Clerk org deleted — cancel subscription and deactivate all memberships.
        // Tenant row and audit history are retained for compliance.
        const orgId = typeof evt.data.id === "string" ? evt.data.id : "";
        if (orgId) {
          const rows = await getTenantRowByClerkOrg(orgId);
          const tenantId = rows[0]?.id;
          await cancelTenantByClerkOrg(orgId);
          if (tenantId) {
            await emitSaasAudit({
              tenantId,
              actorUserId: null,
              action: "tenant.canceled",
              targetType: "organization",
              targetId: orgId,
              metadata: { source: "clerk_webhook", clerkEvent: "organization.deleted" },
            });
          }
        }
        break;
      }
      case "user.deleted": {
        // User deleted from Clerk — remove from all tenants.
        const userId = typeof evt.data.id === "string" ? evt.data.id : "";
        if (userId) {
          await deleteAllMembershipsForUser(userId);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[clerk-webhook]", e);
    try {
      const orgFromEvt = (() => {
        const d = evt.data;
        if (typeof d.id === "string") return d.id;
        const org = (d as { organization?: { id?: string } }).organization?.id;
        return org ?? "";
      })();
      if (orgFromEvt && tryGetDb()) {
        const rows = await getTenantRowByClerkOrg(orgFromEvt);
        const tid = rows[0]?.id;
        if (tid) {
          await emitSaasSecurity({
            tenantId: tid,
            severity: "high",
            eventType: "clerk_webhook_handler_failed",
            metadata: { err: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
