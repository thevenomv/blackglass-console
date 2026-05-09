/**
 * Canonical host-id derivation.
 *
 * Both the SSH-pull and push-agent paths must produce IDENTICAL
 * canonical IDs so a host that switches collection mode keeps its
 * baseline, drift history, and audit trail.
 *
 * Canonical form
 * --------------
 *   `host-` + lower(input) with:
 *     - dots `.`             → dashes `-`
 *     - any non `[a-z0-9-]`  → dashes `-`
 *     - collapse runs of `-`
 *     - strip leading/trailing dashes
 *
 * Examples
 * --------
 *   normaliseHostId("167.99.59.55")            === "host-167-99-59-55"
 *   normaliseHostId("Production-Web-01")       === "host-production-web-01"
 *   normaliseHostId("My Server (prod).int")    === "host-my-server-prod-int"
 *   normaliseHostId("host-167-99-59-55")       === "host-167-99-59-55"  (idempotent)
 *
 * The `host-` prefix is added if not already present so callers can
 * pass either an IP / DNS name or an existing hostId and get back the
 * same canonical value.
 */

const PREFIX = "host-";

/**
 * Normalise an arbitrary user input (IP, DNS name, hostId, free-form
 * label) to the canonical hostId form.
 *
 * Throws when the input collapses to nothing useful (e.g. all special
 * characters) — callers should catch and surface a validation error.
 */
export function normaliseHostId(input: string): string {
  if (typeof input !== "string") {
    throw new Error("hostId input must be a string");
  }
  let body = input.trim().toLowerCase();
  if (body.startsWith(PREFIX)) body = body.slice(PREFIX.length);

  body = body
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!body) {
    throw new Error("hostId input does not contain any normalisable characters");
  }
  return PREFIX + body;
}

/**
 * Like `normaliseHostId` but returns `null` on bad input instead of
 * throwing. Convenient for query-string handlers.
 */
export function tryNormaliseHostId(input: string | null | undefined): string | null {
  if (input == null) return null;
  try {
    return normaliseHostId(String(input));
  } catch {
    return null;
  }
}

/**
 * `true` when `input` already matches the canonical form. Used by tests
 * and migration tooling to spot raw IDs that need re-normalisation.
 */
export function isCanonicalHostId(input: string): boolean {
  if (!input.startsWith(PREFIX)) return false;
  const body = input.slice(PREFIX.length);
  return body.length > 0 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(body);
}
