# Access review (quarterly, SOC2-ish hygiene)

Track in a private compliance folder; this document is the **process** only.

## Inventory (who / what)

| Surface | Owner | Revocation channel |
|---------|-------|---------------------|
| DigitalOcean org | Billing admin | Org → Teams → revoke seat |
| `DIGITALOCEAN_ACCESS_TOKEN` scripts | Ops | Personal Access Tokens → revoke + rotate `.env`/Doppler |
| GitHub org / repo admins | CTO/DRI | Org → Members, enable SSO+MFA audit |
| Doppler configs | Ops | Rotate service tokens quarterly |
| Stripe dashboard | Billing | Rotate restricted keys; audit Team members |
| Sentry (`SENTRY_AUTH_TOKEN` CI) | Eng | Rotate org token |

## Quarterly drill

1. Export current member lists (DO/GitHub/Doppler/Stripe) → attach to ticket.  
2. Remove departing staff same day tokens used in CI / scripts.  
3. Verify **`AUTH_SESSION_SECRET`** + **`STRIPE_WEBHOOK_SECRET`** not older than policy (rotate if mandated).  
4. Spot-check **`docs/staging-deployment-checklist.md`** still matches production env parity.
