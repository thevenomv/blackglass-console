import { zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";

/** Minimal downloadable artifact — replace with streamed ZIP from object storage. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const id = idParsed.data;
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
