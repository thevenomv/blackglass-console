/**
 * GET /api/v1/hosts/:id
 * Returns a HostRecord for the requested host.
 * Live data when collector is configured, mock fallback otherwise.
 */

import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { loadHosts } from "@/lib/server/inventory";
import { getHostDetail } from "@/data/mock/hosts";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const id = idParsed.data;

  // Try real inventory first (works when collector is configured).
  const hosts = await loadHosts();
  const host = hosts.find((h) => h.id === id);
  if (host) return NextResponse.json(host);

  // Fall back to mock for demo/dev mode.
  const mock = getHostDetail(id);
  if (mock) {
    // Return only the HostRecord subset (strip HostDetail extras).
    const { baselineId: _b, baselineLabel: _bl, integrityBars: _ib,
            deltaCounts: _dc, ports: _p, users: _u, services: _s,
            sshFirewall: _sf, timeline: _t, ...record } = mock;
    return NextResponse.json(record);
  }

  return jsonError(404, "host_not_found");
}
