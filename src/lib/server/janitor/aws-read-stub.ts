/**
 * Placeholder AWS read credential check. Replace with STS/GetCallerIdentity or
 * scoped IAM simulation once Charon lists EC2/EBS/RDS idle resources.
 */

export async function validateAwsReadCredentialStub(
  credential: string,
): Promise<
  { ok: true; verified: string[] } | { ok: false; status: number; detail: string }
> {
  const trimmed = credential.trim();
  if (trimmed.length < 32) {
    return { ok: false, status: 400, detail: "aws_credential_too_short" };
  }
  // Optional: accept JSON access key object shape for future use
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof o.accessKeyId === "string" && typeof o.secretAccessKey === "string") {
        return { ok: true, verified: ["aws:read_stub", "aws:key_material_shape_ok"] };
      }
    } catch {
      return { ok: false, status: 400, detail: "aws_credential_invalid_json" };
    }
  }
  return { ok: true, verified: ["aws:read_stub", "aws:opaque_token_accepted"] };
}
