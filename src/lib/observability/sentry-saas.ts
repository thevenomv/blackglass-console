export async function applySaasSentryContext(input: {
  tenantId?: string;
  clerkOrgId?: string;
  requestId?: string;
}): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    if (input.tenantId) Sentry.setTag("tenant_id", input.tenantId);
    if (input.clerkOrgId) Sentry.setTag("clerk_org_id", input.clerkOrgId);
    if (input.requestId) Sentry.setTag("request_id", input.requestId);
    Sentry.setContext("saas", {
      tenant_id: input.tenantId,
      clerk_org_id: input.clerkOrgId,
    });
  } catch {
    // Sentry optional in some runtimes
  }
}
