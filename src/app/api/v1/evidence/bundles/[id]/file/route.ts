import { NextResponse } from "next/server";

/** Minimal downloadable artifact — replace with streamed ZIP from object storage. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = JSON.stringify(
    {
      bundle_id: id,
      note: "BLACKGLASS stub artifact — wire packaging service for ZIP/PDF.",
      generated_at: new Date().toISOString(),
    },
    null,
    2,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="blackglass-bundle-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
