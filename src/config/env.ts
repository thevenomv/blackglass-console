import { z } from "zod";

/**
 * Validated environment slice — expand as you tighten production contracts.
 * Run `npm run env:check` (uses `scripts/verify/validate-env.ts`) in CI or before deploy.
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    AUTH_REQUIRED: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    REDIS_QUEUE_URL: z.string().optional(),
    COLLECTOR_HOST_1: z.string().optional(),
    NEXT_PUBLIC_USE_MOCK: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  })
  .passthrough();

export type ParsedServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; data: ParsedServerEnv }
  | { ok: false; message: string; issues: z.ZodError } {
  const r = serverEnvSchema.safeParse(env);
  if (!r.success) {
    return { ok: false, message: r.error.message, issues: r.error };
  }
  return { ok: true, data: r.data };
}

const TRUTHY_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSY_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Normalizes an env var string to a boolean.
 * Truthy: "true", "1", "yes", "on" (case-insensitive).
 * Falsy: "false", "0", "no", "off".
 * Unknown: returns `defaultValue` (defaults to `false`).
 */
export function parseBoolEnv(value: string | undefined, defaultValue = false): boolean {
  const normalized = value?.toLowerCase().trim();
  if (normalized !== undefined && TRUTHY_VALUES.has(normalized)) return true;
  if (normalized !== undefined && FALSY_VALUES.has(normalized)) return false;
  return defaultValue;
}
