# `drift-engine/` — refactor progress

The 2026-05-16 layout refactor carved this out from a 1142-line monolith. The
current shape is the **first pass**: storage, async reads, helpers, and the
compute function each live in their own file, but `compute.ts` is still the
~950-line bulk that needs per-category splitting.

## Current layout

```
drift-engine/
  index.ts        // ✅ pure re-exports of the public API
  helpers.ts      // ✅ id(), now() — leaf utilities
  store.ts        // ✅ eventStore, persist, loadFromFile, getDriftEvents,
                  //    hasDriftData, storeDriftEvents (sync)
  store-async.ts  // ✅ getDriftEventsAsync, hasDriftDataAsync,
                  //    deleteDriftEvents (Postgres / file refresh)
  compute.ts      // ⏳ computeDrift — still one big function
```

## Public API (must remain exported from `index.ts`)

- `storeDriftEvents`, `deleteDriftEvents`
- `getDriftEvents`, `getDriftEventsAsync`
- `hasDriftData`, `hasDriftDataAsync`
- `computeDrift`

## Remaining work — split `compute.ts` per category

Target layout when finished:

```
compute/
  index.ts         // computeDrift entry-point that orchestrates the per-category passes
  users.ts         // user / sudo / wheel rule comparisons
  ssh.ts           // sshd_config comparisons
  network.ts       // listening ports, firewall, /etc/hosts
  files.ts         // file-hash / SUID / kernel-module comparisons
  cron.ts          // cron persistence rule
  packages.ts      // installed-package diff
  systemd.ts       // /etc/systemd/system unit-file persistence rule
  rationale.ts     // shared rationale templates per drift category
```

Each per-category module exports a function `(baseline, current, hostId): DriftEvent[]`.
`compute/index.ts` concatenates them in a fixed order.

## Tests that pin the public contract

- `tests/unit/drift/drift-engine.test.ts`
- `tests/unit/drift/drift-digest.test.ts`
- `tests/unit/drift/drift-history.test.ts`

Run these after every extraction step.
