import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session-signing";
import { generateInviteToken } from "@/lib/auth/invite-tokens";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";

export const runtime = "nodejs";

const SESSION = "bg-session";

export async function POST(request: NextRequest) {
  // Must be authenticated as admin
  const sessionToken = request.cookies.get(SESSION)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const payload = await verifySession(sessionToken);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = generateInviteToken();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const inviteUrl = `${appUrl}/api/auth/invite?token=${token}`;

  appendAudit({ action: AUDIT_ACTIONS.INVITE_GENERATED, detail: `Admin generated invite link`, actor: "admin" });

  return NextResponse.json({
    token,
    invite_url: inviteUrl,
    note: "Add this token to the INVITE_TOKENS env var (comma-separated), then share invite_url with your customer.",
  });
}
