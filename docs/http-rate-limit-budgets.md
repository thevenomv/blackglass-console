# HTTP abuse guard budgets

Per-client (IP-derived) defaults in **`src/lib/server/rate-limit.ts`**. When **`RATE_LIMIT_REDIS_URL`** is set, Redis enforces the same quotas across instances; otherwise buckets are **in-memory only** (`docs/rate-limit-redis-adrs.md`).

| Guard                        | Typical route                   | Quota               |
| ---------------------------- | ------------------------------- | ------------------- |
| `checkScanPostRate`          | `POST /api/v1/scans`            | 24 requests / 60s   |
| `checkScanPollRate`          | `GET /api/v1/scans/:id`        | 320 requests / 60s  |
| `checkHealthSecretsProbeRate`| `GET /api/health?probe=secrets` | 12 requests / 60s   |
| `checkLoginRate`             | Server action `signIn`          | 10 requests / 15m   |
| `checkInviteRate`            | `GET /api/auth/invite`         | 10 requests / 60s   |

**IP resolution:** **`clientIp`** prefers **`x-real-ip`**, else the **last** hop in **`x-forwarded-for`** (trusted proxy semantics).
