/**
 * Placeholder GCP credential check. Replace with OAuth/service-account token
 * introspection once Charon lists Compute Engine disks / snapshots, etc.
 */

export async function validateGcpReadCredentialStub(
  credential: string,
): Promise<
  { ok: true; verified: string[] } | { ok: false; status: number; detail: string }
> {
  const trimmed = credential.trim();
  if (trimmed.length < 32) {
    return { ok: false, status: 400, detail: "gcp_credential_too_short" };
  }
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof o.type === "string" && o.type.includes("service_account")) {
        return { ok: true, verified: ["gcp:read_stub", "gcp:service_account_json_shape"] };
      }
    } catch {
      return { ok: false, status: 400, detail: "gcp_credential_invalid_json" };
    }
  }
  return { ok: true, verified: ["gcp:read_stub", "gcp:opaque_token_accepted"] };
}
