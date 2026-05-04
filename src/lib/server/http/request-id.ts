/**
 * Request correlation id for logs, queue payloads, and SaaS audit metadata.
 * Prefer the incoming header when present (LB / edge), otherwise generate.
 */
const REQUEST_ID_RE = /^[\w.+=/@:-]{8,256}$/;

export function getOrCreateRequestId(request: Request): string {
  const raw = request.headers.get("x-request-id")?.trim();
  if (raw && REQUEST_ID_RE.test(raw)) return raw;
  return crypto.randomUUID();
}
