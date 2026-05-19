import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session-signing";
import { generateInviteToken, getInviteTokenTtlHours } from "@/lib/auth/invite-tokens";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { checkGenerateInviteRate, clientIp } from "@/lib/server/rate-limit";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantPermission, SaasAuthError } from "@/lib/saas/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION = "bg-session";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!(await checkGenerateInviteRate(ip))) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (isClerkAuthEnabled()) {
    // In Clerk/SaaS mode, require the members.manage permission before minting an invite.
    // Legacy bg-session cookies are not accepted here — Clerk org invites are the correct flow.
    try {
      await requireTenantPermission("members.manage");
    } catch (e) {
      if (e instanceof SaasAuthError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      }
      console.error("[generate-invite] unexpected auth error", e);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    // Clerk mode: generate-invite still works for legacy tokens but must use Clerk org invites
    // for actual member onboarding. Return the token for informational purposes only.
  } else {
    // Legacy mode: must be authenticated as admin via HMAC-signed session cookie.
    const sessionToken = request.cookies.get(SESSION)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const payload = await verifySession(sessionToken);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const token = generateInviteToken();
  const inviteLinkHours = getInviteTokenTtlHours();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host") ?? ""}`;
  const inviteUrl = `${baseUrl}/api/auth/invite?token=${token}`;

  appendAudit({ action: AUDIT_ACTIONS.INVITE_GENERATED, detail: `Admin generated invite link`, actor: "admin" });

  return NextResponse.json({
    token,
    invite_url: inviteUrl,
    invite_link_hours: inviteLinkHours,
  });
}
