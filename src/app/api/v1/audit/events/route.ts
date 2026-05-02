import { appendAudit, readAudit } from "@/lib/server/audit-log";
import { readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { AuditEventsQuerySchema, AuditPostBodySchema } from "@/lib/server/http/schemas";
import { requireRole } from "@/lib/server/http/auth-guard";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const parsed = AuditEventsQuerySchema.safeParse({ limit: u.searchParams.get("limit") });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return NextResponse.json({ items: readAudit(parsed.data.limit) });
}

export async function POST(request: Request) {
  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;

  const parsed = AuditPostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { action, detail, actor, scan_id } = parsed.data;
  const row = appendAudit({ action, detail, actor, scan_id });
  return NextResponse.json(row, { status: 201 });
}
