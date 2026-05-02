import { loadHosts } from "@/lib/server/inventory";
import { getLimits } from "@/lib/plan";
import { requireRole } from "@/lib/server/http/auth-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const limits = getLimits();
  const all = await loadHosts();
  // Enforce host cap: free tier shows at most maxHosts entries.
  const items = limits.maxHosts === -1 ? all : all.slice(0, limits.maxHosts);
  return NextResponse.json({
    items,
    plan: limits.name,
    host_cap: limits.maxHosts === -1 ? null : limits.maxHosts,
    at_cap: limits.maxHosts !== -1 && all.length >= limits.maxHosts,
  });
}
