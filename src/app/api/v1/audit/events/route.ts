import { appendAudit, readAudit } from "@/lib/server/audit-log";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const lim = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 80));
  return NextResponse.json({ items: readAudit(lim) });
}

export async function POST(request: Request) {
  let action = "";
  let detail = "";
  let actor: string | undefined;
  try {
    const body = (await request.json()) as {
      action?: string;
      detail?: string;
      actor?: string;
    };
    action = body.action ?? "";
    detail = body.detail ?? "";
    actor = body.actor;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!action.trim() || !detail.trim()) {
    return NextResponse.json(
      { error: "action_and_detail_required" },
      { status: 400 },
    );
  }
  const row = appendAudit({ action: action.trim(), detail: detail.trim(), actor });
  return NextResponse.json(row, { status: 201 });
}
