# Auth modes: Clerk SaaS vs legacy cookie

| Mode | When active | Tenant / workspace | API authorization |
|------|-------------|----------------------|-------------------|
| **Clerk B2B** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` + `DATABASE_URL` | Clerk Organization → `saas_tenants` | Postgres `saas_tenant_memberships.role` + `permissions.ts` |
| **Legacy session** | Clerk keys unset | N/A (global console) | `AUTH_REQUIRED` + signed `bg-session` cookie role |

Rules:

- Do not mix Clerk org context with legacy `requireRole` in the same handler for mutations — SaaS routes should branch on `isClerkAuthEnabled()` then call `requireSaasOperationalMutation` / `requireSaasOrLegacyPermission` patterns in `src/lib/server/http/saas-access.ts`.
- **`CLERK_ENFORCE_APP_MFA=true`** — `requireTenantAuth` rejects API context until `user.twoFactorEnabled` is true (complement Clerk dashboard MFA policies).
- **`CLERK_REQUIRE_STEP_UP=true`** — JWT/session template must expose numeric claim **`fva`** (seconds since primary second factor). Used by `requireRecentPrimaryVerification()` for billing portal, collector key rotation (when enabled), and optional invite step-up (`CLERK_ENFORCE_INVITE_STEP_UP`).
- **No active org** — routes that call `requireTenantAuth` redirect browser flows to **`/select-workspace`** when Clerk returns `no_organization` (HTTP 400 `SaasAuthError`).

## Stripe + `saas_subscriptions`

Checkout (authenticated org) sends **`saas_tenant_id`** in session + subscription metadata. Webhooks call **`src/lib/saas/stripe-sync.ts`** to update `plan_code`, limits, Stripe IDs, and period fields. Apply **`docs/migrations/005_saas_stripe_link.sql`** when adding columns in prod.
