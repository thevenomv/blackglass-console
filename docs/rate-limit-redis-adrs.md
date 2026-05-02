# ADR sketch — Distributed rate limiting (Redis / Upstash)

**Implemented (optional):** when **`RATE_LIMIT_REDIS_URL`** is set, **`src/lib/server/rate-limit-redis.ts`** applies a **Redis sorted-set sliding window** (Lua) for the same keys as **`src/lib/server/rate-limit.ts`**. Tests and missing/broken Redis **fail open to in-memory** buckets (same behaviour as a single instance).

## Limits of in-memory buckets

- Resets on cold start / HA rolling deploy  
- No coordination across horizontally scaled replicas

## Standard upgrade path

1. **Redis sliding window** — done (ZSET + atomic script).  
2. **Fail-open**: Redis errors → local token bucket (current default). For stricter finance posture, switch to fail-closed in code.  
3. **Edge**: optionally move hot paths (login) to **Cloudflare Workers** KV / DO rate limiting.

Set **`RATE_LIMIT_REDIS_URL`** (`rediss://` for TLS, e.g. Upstash). Enable when you run **>1** App Platform instance or see abuse skew across replicas. Budgets: **`docs/http-rate-limit-budgets.md`**.
