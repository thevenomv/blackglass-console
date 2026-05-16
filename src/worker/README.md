# BullMQ workers

Each worker is a separate OS process consuming one or more BullMQ queues.
They run **outside the Next.js web tier** so long-running work
(SSH-based scans, webhook delivery with retries, sandbox provisioning,
cloud-API janitor sweeps) never blocks an HTTP request and so we can
scale them independently.

| Folder | Entry | Queues consumed | Run with |
|---|---|---|---|
| `scan/` | `index.ts` | `scan-jobs` | `npm run worker` |
| `ops/` | `index.ts` | `outbound-webhooks`, `blackglass-janitor`, `data-exports`, retention sweeps | `npm run worker:ops` |
| `sandbox/` | `index.ts` | sandbox lifecycle (provision/seed/cleanup) | `tsx src/worker/sandbox/index.ts` |

## Conventions

- Each `<job>/index.ts` is the **entry point** that creates the BullMQ
  `Worker` and wires concurrency, signal handling, and graceful shutdown.
  It should be small — most logic belongs in `src/lib/server/services/`
  or `src/lib/server/queue/` and is imported here.
- Each worker is bundled to `dist/worker/<job>-worker.cjs` by
  `scripts/build/build-worker.mjs` for the DigitalOcean App Platform
  deployment (see `.do/app-git.production.yaml`).
- Imports use the `@/` alias only — these files must be relocatable
  without rewriting relative paths.
