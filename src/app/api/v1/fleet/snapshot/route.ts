import { loadFleetSnapshot } from "@/lib/server/inventory";
import { NextResponse } from "next/server";

export async function GET() {
  const snapshot = await loadFleetSnapshot();
  return NextResponse.json(snapshot);
}
