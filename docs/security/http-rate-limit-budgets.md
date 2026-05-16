# HTTP abuse guard budgets

Per-client (IP-derived) defaults in **`src/lib/server/rate-limit.ts`**. When **`RATE_LIMIT_REDIS_URL`** is set, Redis enforces the same quotas across instances; otherwise buckets are **in-memory only** (`docs/security/rate-limit-redis-adrs.md`).

| Guard                        | Typical route                   | Quota               |
| ---------------------------- | ------------------------------- | ------------------- |
| `checkScanPostRate`          | `POST /api/v1/scans`            | 24 requests / 60s   |
| `checkScanPollRate`          | `GET /api/v1/scans/:id`        | 320 requests / 60s  |
| `checkHealthSecretsProbeRate`| `GET /api/health?probe=secrets` | 12 requests / 60s   |
| `checkLoginRate`             | Server action `signIn`          | 10 requests / 15m   |
| `checkInviteRate`            | `GET /api/auth/invite`         | 10 requests / 60s   |
| `checkJanitorCleanupPostRate` | `POST /api/v1/janitor/cleanup`, `POST .../cleanup/approve` | 20 requests / 60s |
| `checkContactSalesRate`      | `POST /api/contact-sales`       | 5 requests / 10m / IP |
| `checkToolsCloudWasteReportRate`      | `POST /api/tools/cloud-waste-report` | 5 requests / 10m / IP |
| `checkToolsCloudWasteReportEmailRate` | `POST /api/tools/cloud-waste-report` | 1 request / 24h / recipient (SHA-256 hashed) |

**IP resolution:** **`clientIp`** prefers **`x-real-ip`**, else the **last** hop in **`x-forwarded-for`** (trusted proxy semantics).

## Required deployment posture for `clientIp`

Every per-IP guard above relies on the request hitting Next.js *through* a trusted reverse proxy (DO App Platform's load balancer, nginx, or Cloudflare in front of a custom deploy). That proxy **must strip and replace** any client-supplied `x-real-ip` and `x-forwarded-for` headers before forwarding.

If the app is exposed directly to the internet without that stripping in place, an attacker can:

- Send `x-real-ip: <random>` on every request and bypass per-IP rate limits by rotating the spoofed value.
- Pin all their abusive traffic to one shared / popular IP and lock legitimate users out of the rate-limited endpoints.

**Verifying:** on DigitalOcean App Platform this is the default behaviour — no action needed. For nginx-fronted custom deploys, the relevant directives are:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

`$proxy_add_x_forwarded_for` *appends* the immediate-upstream IP to whatever the client sent, which is why `clientIpFromXff` deliberately reads the **last** entry — the proxy-appended one — rather than the first. The `x-real-ip` shortcut, however, has no such defence: it must be authoritatively set by the proxy.

A short post-deploy smoke check (also documented in `docs/security/security-pentest-checklist.md`):

```bash
# Should return your real public IP, NOT 1.2.3.4
curl -sH 'x-real-ip: 1.2.3.4' https://blackglasssec.com/api/health
```
