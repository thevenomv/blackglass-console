export async function applySaasSentryContext(input: {
  tenantId?: string;
  clerkOrgId?: string;
  requestId?: string;
  userId?: string;
  plan?: string;
}): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    if (input.tenantId) Sentry.setTag("tenant_id", input.tenantId);
    if (input.clerkOrgId) Sentry.setTag("clerk_org_id", input.clerkOrgId);
    if (input.requestId) Sentry.setTag("request_id", input.requestId);
    if (input.userId) Sentry.setTag("user_id", input.userId);
    if (input.plan) Sentry.setTag("plan", input.plan);
    // Tag deployment environment — never includes secrets or tokens.
    const env = process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV ?? "unknown";
    Sentry.setTag("env", env);
    Sentry.setContext("saas", {
      tenant_id: input.tenantId,
      clerk_org_id: input.clerkOrgId,
      user_id: input.userId,
      plan: input.plan,
      env,
    });
  } catch {
    // Sentry optional in some runtimes
  }
}
