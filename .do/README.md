# DigitalOcean App Platform specs

| File | Use when |
|------|----------|
| `app.yaml` | Deploy from DigitalOcean Container Registry (DOCR). Replace registry placeholders, then `doctl apps create --spec .do/app.yaml` (see header comments). |
| `app-git.production.yaml` / `app-git.staging.yaml` | GitHub App–connected apps (deploy on push). Replace `OWNER/REPO` with your fork before applying. |
| `app-current.yaml` | **Template** exported spec shape — replace placeholders; do not treat as your live secrets source. Prefer Doppler / DO dashboard for values. |
| `app-create.phase1.json` | Bootstrap metadata referenced by `scripts/do_bootstrap_blackglass.py`. |

Supporting scripts live under [`../scripts/`](../scripts/) (`do-prepare-app-spec.ps1`, `do-docker-push.ps1`, Python bootstrap).

## What runs on build

App Platform specs in this repo use **`npm ci && npm run build`** for `build_command` and **`npm run start`** for `run_command` (see `app-current.yaml`, `app-git.*.yaml`, and `app-create.phase1.json`). That matches `package.json`: `build` is **`next build`**.

The production [Dockerfile](../Dockerfile) path is similar for the image build: **`npm ci`** then **`npm run build`** in the builder stage (no separate lint step).

## ESLint and App Platform

Many teams see **ESLint fail or behave inconsistently on App Platform builders** while the same project passes locally and in GitHub Actions. Causes are often environmental: smaller build containers (memory pressure), different Node/npm patch levels, `NODE_OPTIONS`, production-style installs, or changes in how **Next.js** wires **`next lint`** / ESLint.

**Practical setup for this repo**

- Treat **CI (`.github/workflows/ci.yml`)** as the source of truth for **`npm run lint`**. The committed DO specs **do not** run lint on deploy.
- Keep App Platform deploys on **`npm ci` + `next build`** unless you have a strong reason to extend `build_command`.
- This app’s `next.config` sets **`eslint.ignoreDuringBuilds: true`**, so **`next build`** does not invoke ESLint during the build step. If you add **`npm run lint`** to the DO `build_command` (or run ESLint another way on the builder), expect possible flakiness or failures that do not reflect application correctness; debug on the builder or align the environment with CI before blocking releases on it.
