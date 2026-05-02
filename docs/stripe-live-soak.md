# Stripe live soak (7-day checklist)

Goal: demonstrate billing + plan persistence survives real churn before GA.

Use alongside [docs/stripe-live-cutover.md](stripe-live-cutover.md).

| Day | Checkpoint |
|-----|--------------|
| 0 | Rotate **live** Stripe keys vs test; webhook signing secret pinned in Doppler. |
| 1 | Daily subscription checkout succeeds; reconcile Stripe dashboard vs internal **`plan`** (Spaces / env). |
| 2 | Simulate failed payment (Stripe test card) — verify downgrade path + audit row `plan.reverted` or equivalent. |
| 3 | Run two deploys (App Platform) — ensure **`SENTRY_RELEASE`** + plan cache refresh still align. |
| 4 | Refund / cancel — confirm webhook idempotency (no duplicate `plan.changed`). |
| 5 | Manual portal session via billing link — customer can self-serve cancel. |
| 6 | Export audit JSONL + Stripe event log — cross-check trace IDs. |
| 7 | Sign-off: operator + engineering review of discrepancies. |

Record outcomes in the ticket; attach redacted **`verify-audit-jsonl-integrity`** digests for exports.
