/**
 * agent-auth — shared Bearer-token validation for agent-facing
 * endpoints (push-ingest + wake polling).
 *
 * Reuses the same credential model as `/api/v1/ingest/agent`:
 *   - Per-host token via INGEST_HOST_KEYS_JSON (preferred — narrow blast
 *     radius, easy to rotate one host at a time).
 *   - Shared INGEST_API_KEY fallback (single-tenant deployments).
 *
 * Comparison is done with `timingSafeEqual` so a token-guessing
 * attacker can't side-channel byte-by-byte. The function is sync — the
 * underlying primitives are sync — but `timingSafeEqual` is loaded
 * lazily so this module is safe to import in edge bundles.
 */

import { parseHostIngestKeys } from "@/lib/server/ingest-credentials";

/**
 * Validate the `Authorization: Bearer …` header for an agent
 * endpoint targeting `hostId`. Returns true iff the token matches
 * either the per-host secret OR the shared INGEST_API_KEY.
 */
export function isAgentBearerAuthorized(
  authHeader: string,
  hostId: string,
): boolean {
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return false;

  const sharedKey = process.env.INGEST_API_KEY?.trim() ?? "";
  const hostKeys = parseHostIngestKeys();
  const perHost = hostKeys[hostId] ?? "";

  // No credential configured anywhere → fail closed. Better to
  // return 401 than silently accept any token.
  if (!sharedKey && !perHost) return false;

  // Use require() so this module stays edge-friendly. node:crypto
  // is available in the Node runtime (which all our agent-facing
  // routes opt into via `dynamic = "force-dynamic"`).
  const { timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
  const enc = (s: string): Buffer => Buffer.from(s, "utf8");
  const safeEqual = (expected: string): boolean =>
    token.length === expected.length &&
    timingSafeEqual(enc(token), enc(expected));

  // Per-host first — narrowest scope wins. We don't fall through to
  // the shared key when a per-host key exists for this host but
  // doesn't match: that would let an attacker who learned the
  // shared key impersonate a host whose admin already rotated to
  // per-host. Per-host SHADOWS shared.
  if (perHost) return safeEqual(perHost);
  return safeEqual(sharedKey);
}
