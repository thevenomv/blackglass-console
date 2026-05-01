import { loadHosts } from "@/lib/server/inventory";
import { NextResponse } from "next/server";

export async function GET() {
  const items = await loadHosts();
  return NextResponse.json({ items });
}
