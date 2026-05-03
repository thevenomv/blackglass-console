# Webhook processing (Stripe & Clerk)

## At-least-once delivery

Both Stripe and the Clerk Svix endpoint may retry the same logical delivery. This app **claims** an idempotency key in Postgres (`saas_webhook_idempotency`) **before** running handler logic so duplicate deliveries short-circuit with HTTP 200 and `{ duplicate: true }` (Clerk) or `{ received: true }` (Stripe).

## Failure semantics

Handlers run **after** the claim. If the process crashes mid-handler, the event may not be fully applied but the idempotency key remains — **automatic replay will skip** that event ID. Operational mitigation:

1. Fix the bug and **manually reconcile** Stripe/Clerk state for affected tenants (billing dashboard, Clerk Organizations).
2. Optionally **delete** the idempotency row for that `source` / `event_key` and ask the provider to redeliver (use only under change control).

## Future: transactional outbox

For stricter guarantees, move to **outbox pattern**: insert webhook row + domain events in one DB transaction; a worker applies domain events idempotently. This sketch matches the current “claim then process” model documented for operators in [docs/operator-guide.md](operator-guide.md).
