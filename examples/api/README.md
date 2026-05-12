# Blackglass API examples

These snippets target the **Next.js** API prefix **`/api/v1`** on your console origin (for example `https://your-deployment.example` or `http://127.0.0.1:3000` locally).

The canonical contract is [openapi/blackglass.yaml](../../openapi/blackglass.yaml). Regenerate TypeScript types with `npm run openapi:types` when the spec changes.

## Authentication

Programmatic access uses a **tenant API key** issued in the console (format `bg_live_` + hex). Send it as a Bearer token:

```http
Authorization: Bearer bg_live_…
```

Session-cookie auth is used by the browser; these examples focus on Bearer keys suitable for CI and integrations.

## Environment

| Variable | Purpose |
|----------|---------|
| `BLACKGLASS_API_BASE_URL` | Origin only, no trailing slash (default `http://127.0.0.1:3000`) |
| `BLACKGLASS_API_TOKEN` | Raw API key (`bg_live_…`) |

## curl — health (unauthenticated helper)

Many deployments expose aggregate health at `/api/health` (not under `/v1` in the OpenAPI “servers” sense — it lives on the app root):

```bash
curl -sS "${BLACKGLASS_API_BASE_URL:-http://127.0.0.1:3000}/api/health" | head
```

## curl — list hosts

```bash
BASE="${BLACKGLASS_API_BASE_URL:-http://127.0.0.1:3000}"
curl -sS -H "Authorization: Bearer ${BLACKGLASS_API_TOKEN:?set BLACKGLASS_API_TOKEN}" \
  "${BASE}/api/v1/hosts?limit=5"
```

## Node — list hosts

```bash
BLACKGLASS_API_TOKEN=bg_live_… node examples/api/list-hosts.mjs
```

## Next steps

- Open [openapi/blackglass.yaml](../../openapi/blackglass.yaml) for scans, drift, evidence bundles, exports, and Charon routes.
- Run `npm run check:openapi` before pushing route changes.
