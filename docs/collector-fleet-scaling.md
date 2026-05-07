# Collector fleet — cost & scaling notes

BLACKGLASS collectors use **SSH** from the worker tier (`scan-worker`,
which depends on `ssh2`) when `REDIS_QUEUE_URL` is set; the web tier
falls back to inline collection only in Stage-0 / dev. Each host
handshake consumes worker CPU and egress bandwidth. Worker concurrency
is RAM-capped at runtime by `floor((total_ram_MB − 256) / 60)`, bounded
by `WORKER_CONCURRENCY` and a hard cap of 32.

## Sizing axes

| Concern | Knob |
|--------|-----|
| Per-host channel concurrency | A single multiplexed SSH channel per host (`BUNDLE_CMD`) — never 14 parallel `exec()` channels. Stays well under `MaxSessions=10`. |
| Cross-host concurrency       | `COLLECTOR_MAX_PARALLEL_SSH` (default 8, hard max 16) per worker job. |
| Worker scan concurrency      | Dynamic RAM-derived cap, bounded by `WORKER_CONCURRENCY`, hard max 32. |
| Wall-clock per fleet scan    | `async-pool` + timeout in `collect.ts`; overall `AbortController` fires after `COLLECTION_TIMEOUT_MS` (default 75 s). |
| Egress IPs                   | Restrict target firewalls to the IPs published by `GET /api/public/egress-ips` (or pin behind a Floating IP / NAT gateway). |

## Scaling patterns

1. **Vertical:** larger DO instance slug for the worker before adding
   parallelism — avoids SSH thundering herds on small CPUs.
2. **Horizontal:** scale `scan-worker` replicas (BullMQ rebalances jobs
   across consumers automatically).
3. **Regional:** collectors near fleets (latency); avoid cross-region
   SSH when possible.
4. **Queue externalization is shipped:** SSH collection runs in
   `scan-worker` (separate App Platform component / separate Helm
   Deployment) when `REDIS_QUEUE_URL` is configured; the web tier never
   blocks on SSH in the production path.

Revisit pricing when average scan duration × host count threatens SLO
(internal baseline: **< 120 s p95 per host**).
