# ADR sketch — Distributed rate limiting (Redis / Upstash)

Current: **`src/lib/server/rate-limit.ts`** — in-process token buckets keyed by client IP prefixes.

## Limits of in-memory buckets

- Resets on cold start / HA rolling deploy  
- No coordination across horizontally scaled replicas

## Standard upgrade path

1. **Redis sliding window** (`INCR` + `EXPIRE`) keyed by `{route}:{ip_hash}`.  
2. **Fail-open**: if Redis down, optionally allow vs deny (finance apps often deny).  
3. **Edge**: optionally move hot paths (login) to **Cloudflare Workers** KV / DO rate limiting.

Suggested env:**`RATE_LIMIT_REDIS_URL`** (`rediss://` for TLS). Implement only after you run **>1** App Platform instance with real abuse signals.
