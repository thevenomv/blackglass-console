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
import { sendEmail } from "@/lib/email/send";
import { welcomeEmailHtml, welcomeEmailText } from "@/lib/email/templates/welcome";
import { getMarketingContactEmail } from "@/lib/marketing/contact";

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

          // Send welcome email to the creator if we have their email address.
          try {
            const orgMembers = await (await clerkClient()).organizations.getOrganizationMembershipList({ organizationId: orgId });
            const creator = orgMembers.data[0];
            const userId = creator?.publicUserData?.userId;
            if (userId) {
              const user = await (await clerkClient()).users.getUser(userId);
              const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
              const firstName = user.firstName ?? email?.split("@")[0] ?? "there";
              const consoleUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://blackglasssec.com").replace(/\/$/, "");
              if (email) {
                await sendEmail({
                  to: email,
                  subject: "Welcome to Blackglass — your trial is ready",
                  html: welcomeEmailHtml({ firstName, orgName: readOrgName(evt.data), consoleUrl }),
                  text: welcomeEmailText({ firstName, orgName: readOrgName(evt.data), consoleUrl }),
                  replyTo: getMarketingContactEmail(),
                });
              }
            }
          } catch (emailErr) {
            // Non-fatal — log but don't fail the webhook response.
            console.error("[clerk-webhook] welcome email failed", emailErr);
          }
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
      case "user.created": {
        // SCIM provisioning detection.  Clerk doesn't expose a clean
        // "created via SCIM" flag on the webhook payload, so we use
        // the structural heuristic that SCIM-provisioned users have
        // ALL of:
        //   - no password_enabled
        //   - no external_accounts (no OAuth)
        //   - at least one email marked as `from_oauth=false` and
        //     verification.strategy in {"admin", "ticket", null}
        // — i.e. the IdP minted them, the user never signed up
        // interactively. We emit `auth.scim_provisioned` so the
        // SaaS audit log distinguishes IdP-pushed users from in-app
        // invites.
        try {
          const userData = evt.data as {
            id?: string;
            password_enabled?: boolean;
            external_accounts?: unknown[];
            email_addresses?: Array<{
              verification?: { strategy?: string; status?: string };
              from_oauth?: boolean;
            }>;
            organization_memberships?: Array<{
              organization?: { id?: string };
            }>;
          };
          const userId = userData.id;
          if (!userId) break;
          const isScim =
            userData.password_enabled === false &&
            (userData.external_accounts?.length ?? 0) === 0 &&
            (userData.email_addresses ?? []).every((e) => {
              const strat = e.verification?.strategy;
              return e.from_oauth !== true && (strat === "admin" || strat === "ticket" || !strat);
            });
          if (!isScim) break;

          // SCIM users land in an org from the same SCIM transaction;
          // the org id is available either on the user payload's
          // organization_memberships or via a follow-up Clerk API
          // call. Prefer the cheap path (payload field) and fall
          // back to nothing rather than burning an API call.
          const orgId = userData.organization_memberships?.[0]?.organization?.id;
          if (!orgId) break;
          const rows = await getTenantRowByClerkOrg(orgId);
          const tenantId = rows[0]?.id;
          if (!tenantId) break;

          await emitSaasAudit({
            tenantId,
            actorUserId: userId,
            action: "auth.scim_provisioned",
            targetType: "user",
            targetId: userId,
            metadata: {
              clerk_org_id: orgId,
              email_count: (userData.email_addresses ?? []).length,
            },
          });
        } catch (e) {
          console.warn(
            `[clerk-webhook] user.created SCIM audit failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        break;
      }
      case "session.created": {
        // SAML SSO logins arrive as a regular Clerk session — the only
        // signal that this was federated rather than direct password /
        // OAuth is `last_active_organization_id` paired with the user's
        // verifications. We emit a structured audit row so SOC reviewers
        // can filter on `auth.sso_login` distinctly from password
        // logins. Best-effort: never fails the webhook on parse errors.
        try {
          const sessionData = evt.data as {
            user_id?: string;
            last_active_organization_id?: string;
            client_id?: string;
            id?: string;
          };
          const userId = sessionData.user_id;
          const orgId = sessionData.last_active_organization_id;
          if (!userId || !orgId) break;

          // Look up the user's primary verification strategy. We only
          // want to audit SSO/SAML strategies as a security event; OAuth
          // and password sign-ins already have abundant audit coverage.
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          const verifications = (user.emailAddresses ?? [])
            .map((e) => e.verification?.strategy)
            .filter((s): s is string => typeof s === "string");
          const isSaml = verifications.some((s) => s.includes("saml"));
          const isOAuth = verifications.some((s) => s.startsWith("oauth_"));
          if (!isSaml) break;

          const rows = await getTenantRowByClerkOrg(orgId);
          const tenantId = rows[0]?.id;
          if (!tenantId) break;

          await emitSaasAudit({
            tenantId,
            actorUserId: userId,
            action: "auth.sso_login",
            targetType: "session",
            targetId: sessionData.id ?? null,
            metadata: {
              clerk_org_id: orgId,
              strategies: verifications,
              also_oauth: isOAuth,
            },
          });
        } catch (e) {
          console.warn(
            `[clerk-webhook] session.created SSO audit failed: ${e instanceof Error ? e.message : String(e)}`,
          );
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
