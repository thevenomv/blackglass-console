/**
 * HMAC-SHA256 body signing for outbound webhook deliveries.
 *
 * Two header layout:
 *   - X-Blackglass-Signature:          sha256=<hex>   (current key)
 *   - X-Blackglass-Signature-Previous: sha256=<hex>   (during rotation overlap)
 *
 * Receivers should accept either header to ride through key rotation.
 */

import { createHmac } from "node:crypto";

export function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Inject HMAC-SHA256 signature header(s) onto an outbound request.  Caller
 * is responsible for the platform-specific body shape.
 *
 * - Always emits `X-Blackglass-Signature: sha256=<hex>` when the current
 *   signing key is set.
 * - Additionally emits `X-Blackglass-Signature-Previous: sha256=<hex>` when
 *   the previous key is still inside the rotation overlap window so
 *   receivers can verify against either key during the cutover.
 */
export function applySignatureHeaders(
  headers: Record<string, string>,
  body: string,
  signingKey: string | null,
  previousSigningKey: string | null,
): void {
  if (signingKey) {
    headers["X-Blackglass-Signature"] = `sha256=${sign(body, signingKey)}`;
  }
  if (previousSigningKey) {
    headers["X-Blackglass-Signature-Previous"] = `sha256=${sign(body, previousSigningKey)}`;
  }
}
