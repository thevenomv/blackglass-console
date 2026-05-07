/**
 * GET /api/public/egress-ips
 *
 * Public, unauthenticated, cacheable endpoint that returns the current list
 * of IP addresses BLACKGLASS uses to connect outbound to customer servers
 * (via the SSH collector). Customers point their firewall automation /
 * CMDB at this URL so they don't have to manually update allowlists when
 * we rotate NAT pools.
 *
 * Why public:
 *   - The contents are already public knowledge — every customer's
 *     firewall already accepts traffic from these IPs.
 *   - Removing the auth requirement lets headless infra-as-code (Terraform,
 *     Ansible, Pulumi) consume it without provisioning service tokens.
 *
 * Source of truth:
 *   - Env var COLLECTOR_EGRESS_IPS (comma-separated). Same value that
 *     powers Settings → Collector egress IPs in the UI.
 *
 * Caching:
 *   - Cache-Control: public, max-age=300, s-maxage=900 — the IP set rarely
 *     changes (we publish to a "next set" 24h before cutting over) so a
 *     5min client cache + 15min CDN cache is safe.
 *   - Last-Modified header reflects deploy time (env vars are baked in at
 *     boot) so customers can use If-Modified-Since.
 *
 * Format:
 *   {
 *     "egress_ips": ["1.2.3.4", "1.2.3.5"],
 *     "next_set": ["1.2.3.6"],   // populated only when COLLECTOR_EGRESS_IPS_NEXT is set
 *     "rotates_at": "2026-05-15T00:00:00Z" | null,
 *     "updated_at": "<deploy-time ISO>"
 *   }
 *
 * Operators: when planning a NAT rotation, set COLLECTOR_EGRESS_IPS_NEXT
 * 24-72h before the cutover so customers can pre-allowlist the new IPs;
 * after the cutover, move them into COLLECTOR_EGRESS_IPS and clear the
 * NEXT slot. The endpoint surfaces both lists during the overlap window.
 */

export const dynamic = "force-static";
export const revalidate = 300; // 5 minutes

const BOOT_TIME_ISO = new Date().toISOString();

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function rotatesAt(): string | null {
  const raw = process.env.COLLECTOR_EGRESS_IPS_ROTATES_AT?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function GET() {
  const current = parseList(process.env.COLLECTOR_EGRESS_IPS);
  const next = parseList(process.env.COLLECTOR_EGRESS_IPS_NEXT);
  const cutover = rotatesAt();

  const body = JSON.stringify(
    {
      egress_ips: current,
      next_set: next.length > 0 ? next : null,
      rotates_at: cutover,
      updated_at: BOOT_TIME_ISO,
      docs: "https://app.blackglasssec.com/legal/egress-ips",
    },
    null,
    2,
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800",
      "Last-Modified": new Date(BOOT_TIME_ISO).toUTCString(),
      // Hint to consumers that this is intentionally machine-readable.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
