# Deploying the scan-worker on DigitalOcean App Platform

The `scan-worker` is the BullMQ consumer for `blackglass-scans`. When it isn't
running, scan jobs sit in Redis indefinitely — unless the in-process fallback in
`/api/v1/scans` catches the empty worker pool and runs them on the web tier
(slow, blocks the request thread, doesn't scale).

There are two ways a `scan-worker` can be missing in production:

1. The component isn't defined in the active App Platform spec (this happens after
   a `doctl apps update` with an older YAML overwrites the live config).
2. It's defined but failing its build / crashing on startup.

This runbook is for case (1). Case (2) is logs-from-DO-dashboard.

---

## 1. Confirm it's actually missing

```bash
# List all components in the live app and look for `scan-worker`
doctl apps spec get <APP_ID> | grep -E "name:.*worker"
```

You should see `sandbox-worker`, `ops-worker`, AND `scan-worker`. If `scan-worker`
is absent, the active spec was clobbered.

You can also confirm from the in-app log:

```
[scans-route] REDIS_QUEUE_URL is set but no scan-worker is registered.
Falling back to in-process execution for jobId=…
```

---

## 2. Re-apply the canonical spec

The source of truth lives at `.do/app-git.production.yaml`. To re-apply:

```bash
# 1. Get the app ID once
APP_ID=$(doctl apps list --format ID,Spec.Name --no-header | grep blackglass | awk '{print $1}')

# 2. Validate the spec locally first — catches typos before they hit production
doctl apps spec validate .do/app-git.production.yaml

# 3. Push the spec
doctl apps update "$APP_ID" --spec .do/app-git.production.yaml

# 4. Tail the deploy
doctl apps list-deployments "$APP_ID" --format ID,Phase,Progress.Steps[0].Status --no-header | head -5
```

The deploy takes ~6–8 min for a clean web + 3 workers + 1 job rebuild.

---

## 3. Confirm the worker is consuming jobs

After the deploy reports `ACTIVE`:

```bash
# Should print >= 1
doctl apps logs "$APP_ID" --component scan-worker --tail 50 \
  | grep -E "Worker.*ready|Listening on queue|Picked up job"
```

In the console (logged in as admin) hit `/api/admin/queues` — `scan-worker` should
appear with `workerCount >= 1` and `waiting=0` after a few seconds.

---

## 4. Verify end-to-end

1. Open the dashboard → command palette → "Run fleet integrity scan".
2. Watch the scan progress pill.
3. It should:
   - Move past "Enumerating listeners…" within 5 s.
   - Show actual progress detail (host names, drift counts).
   - Resolve in 30–60 s for a 1-host fleet, ≤ 5 min for a typical SMB fleet.
4. The web tier log should NOT contain
   `[scans-route] Falling back to in-process execution`.

---

## 5. If the deploy still doesn't restore the worker

Most common cause: the spec YAML is malformed (indentation drift from a previous
edit). `doctl apps spec validate` catches the structural issues but not all the
semantic ones (e.g. wrong `build_command` for a worker that uses `dist/`).

Quick recovery:

1. `git log --oneline .do/app-git.production.yaml` — find the last commit where the
   spec was known-good.
2. `git show <SHA>:.do/app-git.production.yaml > /tmp/spec.yaml`
3. `doctl apps update "$APP_ID" --spec /tmp/spec.yaml`

If you're truly stuck, the in-process fallback we shipped (search for
`getActiveScanWorkerCount` in `src/lib/server/queue/scan-queue.ts`) means scans
keep working — they just block the web tier. Customers won't notice until you have
multiple concurrent scans, so you have hours-not-minutes to fix this.
