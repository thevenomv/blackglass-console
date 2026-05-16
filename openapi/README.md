# OpenAPI

This directory holds the public BLACKGLASS API contract.

| File | Purpose |
|---|---|
| `blackglass.yaml` | Canonical OpenAPI 3.1 spec. Source of truth for `/api/v1/*` routes. |
| `zod-schemas.json` | Generated artefact — Zod schemas exported via `npm run schemas:export`. Committed so contract drift between Zod and OpenAPI is caught in CI by a `git diff --exit-code` in `verify:contract`. |

## How the spec is consumed

| Consumer | Mechanism |
|---|---|
| Generated TypeScript types | `npm run openapi:types` → `src/types/openapi.d.ts` (via `openapi-typescript`) |
| CI coverage check | `npm run check:openapi` (`scripts/build/check-openapi-paths.mjs`) — regex-based reverse check that every `src/app/api/v1/**/route.ts` is documented |
| Zod parity check | `npm run schemas:export` + `git diff --exit-code openapi/zod-schemas.json` |
| Public docs | `examples/api/README.md` links contributors directly at `blackglass.yaml` |

## Section layout inside `blackglass.yaml`

Paths are grouped by tag — they appear in this order inside the single
`paths:` block so the file reads top-to-bottom in logical clusters:

| Block | Approx lines | Tag |
|---|---|---|
| Health / fleet | 35 – 135 | `Hosts` (probe-level) |
| Hosts CRUD | 136 – 358 | `Hosts`, `Baselines` |
| Drift findings | 359 – 423 | `Drift` |
| Evidence bundles | 424 – 488 | `Evidence` |
| Ingest (agent) | 489 – 567 | `Ingest` |
| Reports | 568 – 627 | `Reports` |
| Scans | 628 – 701 | `Scans` |
| Drift list / events | 702 – 766 | `Drift` |
| Collector + webhooks (admin) | 767 – 808 | `Collector`, `Webhooks` |
| API keys | 809 – 928 | `API keys` |
| Exports | 929 – 998 | `Exports` |
| Policies | 999 – 1076 | `Policies` |
| Preferences | 1077 – 1106 | `Preferences` |
| Remediations | 1107 – 1179 | `Remediations` |
| Audit | 1180 – 1219 | `Audit` |
| Sandbox | 1220 – 1267 | `Sandbox` |
| Settings (BYOK, notifs, retention, SCIM, SSO, webhook signing) | 1268 – 1551 | `Settings` |
| Janitor / Charon | 1552 – 1855 | `Charon` |
| Components | 1856 – end | n/a |

## Future split (not yet executed)

The eventual target shape is:

```
openapi/
  blackglass.yaml          # tiny index with $refs
  paths/
    hosts.yaml             # /hosts, /hosts/{id}, /hosts/{id}/baselines, /fleet/snapshot
    baselines.yaml
    scans.yaml
    drift.yaml
    evidence.yaml
    reports.yaml
    ingest.yaml
    api-keys.yaml
    exports.yaml
    policies.yaml
    audit.yaml
    sandbox.yaml
    settings.yaml
    charon.yaml            # /janitor/*
  components.yaml
```

The blockers to executing this today:

1. **Mechanical diff:** Round-tripping through `js-yaml.dump` produces
   a different quote / indent style than the hand-edited file. A clean
   split needs either a stable formatter pass (acceptable, but the diff
   touches every line) or a careful text-based extraction (fragile).
2. **`check-openapi-paths.mjs`** does regex matching against the raw
   YAML text and would need to switch to ref-aware parsing.
3. **`openapi-typescript` $ref support** is fine for components but
   needs validation for path-level external refs against this exact
   tooling version.

When the file becomes a real bottleneck (likely when we add the v2
namespace or split tenants- vs admin-facing surfaces), do the split as
a single focused PR that:

- Adds `js-yaml` as an explicit `devDependency` (currently transitive).
- Rewrites `check-openapi-paths.mjs` to parse + resolve `$ref` via
  `@apidevtools/swagger-parser` or `js-yaml` + manual walk.
- Splits files in the layout above.
- Verifies via `openapi-typescript` round-trip and `npm run check:openapi`.
- Records the move as ADR-0002.

Until then, the section comments above are the navigation aid.
