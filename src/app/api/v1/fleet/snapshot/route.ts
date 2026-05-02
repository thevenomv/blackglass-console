import { loadFleetSnapshot } from "@/lib/server/inventory";
import { requireRole } from "@/lib/server/http/auth-guard";
import { NextResponse } from "next/server";

export async function GET() {
  const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const snapshot = await loadFleetSnapshot();
  return NextResponse.json(snapshot);
}
