import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session-signing";
import { generateInviteToken } from "@/lib/auth/invite-tokens";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { checkGenerateInviteRate, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION = "bg-session";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!(await checkGenerateInviteRate(ip))) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

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
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host") ?? ""}`;
  const inviteUrl = `${baseUrl}/api/auth/invite?token=${token}`;

  appendAudit({ action: AUDIT_ACTIONS.INVITE_GENERATED, detail: `Admin generated invite link`, actor: "admin" });

  return NextResponse.json({
    token,
    invite_url: inviteUrl,
    note: "Add this token to the INVITE_TOKENS env var (comma-separated), then share invite_url with your customer.",
  });
}
