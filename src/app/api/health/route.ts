import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "blackglass-console" }, { status: 200 });
}
