# BLACKGLASS SaaS: Clerk, MFA, billing model, RBAC

This document summarizes what the codebase enforces and what you must configure in Clerk / Postgres.

## Pricing & access (product rules)

- **Charge for action roles, not viewers.** Only `owner`, `admin`, and `operator` consume **paid seats**. `viewer` and `guest_auditor` are unlimited.
- **Commercial plan host & seat envelopes** (reference values in `src/lib/saas/plans.ts`):
  - **Starter** — 25 hosts, 3 paid seats  
  - **Growth** — 100 hosts, 8 paid seats  
  - **Business** — 300 hosts, 15 paid seats  
  - **Enterprise** — custom (negative limits = “no numeric cap” in helpers)
- **14-day trial** created in Postgres when a Clerk org is provisioned: **10 hosts**, **2 paid seats**, then **`trial_expired`** read-only (no permanent free operational tier).
- **Seat exhaustion** blocks inviting **paid** roles only; viewer / guest_auditor invites always succeed.
- **No silent downgrades:** existing memberships stay until an explicit role change; enforcement is on **invite / role update** paths.

## Clerk (dashboard configuration)

1. **Organizations** enabled — each org maps 1:1 to `saas_tenants.clerk_org_id`.
2. **Mandatory MFA** at the instance or session policy; prefer **TOTP** as primary, SMS only as fallback, **backup codes** on.
3. **Attack protection** (bot / identifier enumeration) per Clerk recommendations.
4. **Webhooks** → `POST /api/webhooks/clerk` with signing secret `CLERK_WEBHOOK_SECRET`. Subscribe at minimum to:
   - `organization.created`
   - `organizationMembership.created` / `updated` / `deleted`
5. Optional **custom JWT / session template** exposing numeric `fva` (*factor verification age*) if you set `CLERK_REQUIRE_STEP_UP=true` for API step-up checks.

**Do not paste secrets into chat or commit them.** Publishable keys belong in `NEXT_PUBLIC_*` only; rotate if exposed.

## Stripe → Postgres (`saas_subscriptions`)

When **`DATABASE_URL`** is set and checkout includes **`saas_tenant_id`** metadata (automatic when the user is signed into a Clerk org), Stripe webhooks sync:

- `plan_code`, `host_limit`, `paid_seat_limit`, `status`, billing period timestamps  
- `stripe_customer_id`, `stripe_subscription_id` (for portal customer matching)

Migration: **`docs/migrations/005_saas_stripe_link.sql`**. Price → plan mapping uses optional env vars documented in `.env.example` (`STRIPE_STARTER_PRICE_ID`, …). Legacy **`STRIPE_PRO_PRICE_ID`** maps to the Starter envelope.

## Authorization architecture

- **Clerk** proves identity + org selection. **Postgres** (`saas_tenant_memberships.role`) is the **authorization source of truth** for the app permission matrix in `src/lib/saas/permissions.ts`.
- API handlers must call helpers such as `requireTenantPermission(...)` / `requireScanEnqueueAccess()` — never trust client-rendered role badges.
- **Privilege mutations** (e.g. invites when `CLERK_ENFORCE_INVITE_STEP_UP=true`) should pair with `requireRecentPrimaryVerification()` once Clerk `fva` is wired.

## Database

Apply `docs/migrations/004_saas_clerk_core.sql` (or `npm run db:push` in non-prod) after `DATABASE_URL` is set. Drizzle schema lives in `src/db/schema.ts`.

## Audit & security events

- Tenant-scoped audit writes: `emitSaasAudit` (`saas_audit_events`).
- Rate / policy blocks: `emitSaasSecurity` (`saas_security_events`).
- Never log secrets, tokens, or MFA recovery material — only opaque IDs and coarse metadata.

## What is intentionally incremental

- Stripe **subscription → `saas_subscriptions` plan transition** after checkout remains a follow-on (billing UI links to existing `/pricing` flow).
- Full coverage of **every** legacy API route with SaaS guards is not complete; `POST /api/v1/scans` is the reference integration pattern in `src/lib/server/http/saas-access.ts`.
- **MFA “first login”** UI is primarily Clerk-hosted; set `CLERK_ENFORCE_APP_MFA=true` to hard-block API usage without `twoFactorEnabled`.

## Tests

See `tests/unit/saas-rbac.test.ts` for seat math, trial read-only scan blocking, and role assignment rules.
