/**
 * Zod shapes for Charon linked-account JSON credentials (AWS access-key blob,
 * GCP service-account JSON). Non-JSON opaque strings skip these schemas —
 * the route still applies length checks and stub validators.
 */

import { z } from "zod";

/** AWS access-key object (optional multi-region list per docs/charon.md). */
export const JanitorAwsCredentialJsonSchema = z
  .object({
    accessKeyId: z.string().min(16).max(128),
    secretAccessKey: z.string().min(1).max(4096),
    region: z.string().min(2).max(32).optional(),
    regions: z.array(z.string().min(2).max(32)).max(14).optional(),
  })
  .strict();

/** Minimal service-account fields; passthrough allows full Google JSON. */
export const JanitorGcpServiceAccountJsonSchema = z
  .object({
    type: z.literal("service_account"),
    project_id: z.string().min(1).max(256),
    private_key: z.string().min(1),
    client_email: z.string().email(),
  })
  .passthrough();

export function validateJanitorCredentialJsonShape(provider: "aws" | "gcp", value: unknown) {
  return provider === "aws"
    ? JanitorAwsCredentialJsonSchema.safeParse(value)
    : JanitorGcpServiceAccountJsonSchema.safeParse(value);
}
