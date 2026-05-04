import { z } from "zod";

/**
 * Validated environment slice — expand as you tighten production contracts.
 * Run `npm run env:check` (uses `scripts/validate-env.ts`) in CI or before deploy.
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
