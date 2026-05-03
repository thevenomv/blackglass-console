/**
 * SaaS mode gate: when false, the app expects legacy / self-hosted auth paths
 * (no Clerk orgs). Keep this split explicit for enterprise deployments that
 * license a single-tenant or air-gapped bundle without multi-tenant SaaS.
 */
export function isClerkAuthEnabled(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim()
  );
}
