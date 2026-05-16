# Lost your console passphrase?

**End users (workspace members):** if you sign in with your work email, open  
**[Sign-in help](https://blackglasssec.com/recover#workspace)** — use Clerk’s forgot-password flow on `/sign-in`.

**Shared passphrase only:** operator guidance also appears inline at  
**[Sign-in help → passphrase](https://blackglasssec.com/recover#passphrase)**.  
The old `/passphrase-recovery` URL redirects there permanently.

The sections below are for the **shared deployment passphrase** used at `/login` when
`AUTH_ADMIN_PASSWORD` is set — operators and self-hosted installs only.

If you can't remember the passphrase on `https://blackglasssec.com/login`, read on.

## Why there's no "forgot password" email

The console's `Sign in` form is **not** a per-user account — it's a single shared passphrase that operators use to reach the admin dashboard. Source: [`src/app/(auth)/login/actions.ts`](../src/app/(auth)/login/actions.ts) compares the submitted value (constant-time SHA-256) against the deployment-time secret `AUTH_ADMIN_PASSWORD`.

Because there's no user record and no email tied to the credential, there's no out-of-band recovery channel to trigger:

- We can't email you a reset link — there's no email on file.
- We can't read the existing value — it's stored as an encrypted SECRET on the DigitalOcean App Platform deployment and is never readable back.
- We can't ship a customer-facing "forgot password" flow without changing the auth model entirely.

The fix is the same as for any deployment secret you've lost: **rotate it**. Below are the three supported paths, ranked by how much friction they have.

> When the multi-user / Clerk-backed auth migration in `docs/saas/saas-clerk-rbac.md` is finished, the console will use real per-user accounts with proper Clerk-managed forgot-password flows. Until then, the rotation paths below are the canonical recovery story.

## Rotation path 1 — DigitalOcean console UI (no CLI required)

Best when you're not at a workstation that has Doppler / `doctl` configured.

1. Sign in to <https://cloud.digitalocean.com/apps>.
2. Open the **`blackglass`** app (region `lon`).
3. Go to **Settings** → **Components** → **`web`** → **Environment Variables**.
4. Find **`AUTH_ADMIN_PASSWORD`**, click the pencil icon to edit.
5. Paste a new strong passphrase (we suggest 24+ random bytes, base64url-encoded; a password-manager generator is fine).
6. Click **Save**. DO will redeploy the `web` component automatically (5-8 minutes for a Next.js build).
7. Once the deployment phase reaches **`ACTIVE`**, sign in at `/login` with the new passphrase.

The old passphrase stops working the moment the new deployment becomes active — there's no overlap window where both are valid, by design.

## Rotation path 2 — DigitalOcean API via the rotation script (operator workstation)

The repo ships a small one-off Node script at `.local/rotate-passphrase.mjs` (created when needed; the `/.local/` directory is gitignored so the script and its output never enter source control). It does the same thing as the UI flow but in 2 seconds:

```powershell
# Pull the DO API token + app id from Doppler into env vars (no values printed)
$env:DO_API_TOKEN = doppler secrets get DO_API_TOKEN --plain --project blackglass --config prd
$env:DO_APP_ID    = doppler secrets get DO_APP_ID    --plain --project blackglass --config prd

# Run the rotation script
node .local/rotate-passphrase.mjs

# The new passphrase is in .local/new-passphrase.txt. Read it, store it
# in your password manager, then delete the file.
Get-Content .local/new-passphrase.txt
Remove-Item .local/new-passphrase.txt
```

The script:

- Generates a 192-bit random passphrase (`bg-` + 32 base64url chars).
- Writes it to `.local/new-passphrase.txt` (gitignored) — never to stdout.
- Pulls the live DO app spec via `GET /v2/apps/{id}`.
- Surgically replaces the `AUTH_ADMIN_PASSWORD` value on the `web` service, preserving `type: SECRET` and every other field.
- PUTs the modified spec back. DO triggers a redeploy as `cause: "app spec updated"`.
- Refuses to run if `AUTH_ADMIN_PASSWORD` is not already typed as `SECRET` on the spec (sanity guard against accidentally widening the env var's exposure).

After running, monitor the deployment with:

```powershell
$resp = curl.exe -s -H "Authorization: Bearer $env:DO_API_TOKEN" "https://api.digitalocean.com/v2/apps/$env:DO_APP_ID"
($resp | ConvertFrom-Json).app | Select-Object -ExpandProperty in_progress_deployment | Format-List id, phase, cause
```

When `phase` becomes `ACTIVE` (or the `in_progress_deployment` block disappears entirely), the new passphrase is live.

## Rotation path 3 — `doctl` CLI

If you have `doctl` installed and authenticated, the cleanest path is:

```bash
APP_ID="$(doppler secrets get DO_APP_ID --plain --project blackglass --config prd)"
doctl apps spec get "$APP_ID" --format yaml > /tmp/spec.yaml

# Edit /tmp/spec.yaml, find AUTH_ADMIN_PASSWORD on the web service, set value
$EDITOR /tmp/spec.yaml

doctl apps update "$APP_ID" --spec /tmp/spec.yaml
shred -u /tmp/spec.yaml   # spec contains the new SECRET in cleartext until DO accepts it
```

This route is most appropriate when you're already in a CLI-driven ops workflow (e.g. running other `doctl` commands as part of an incident response).

## What if the rotation breaks something?

It shouldn't — the script only touches one env var value. But if a deployment goes red after rotation:

- Check the DO deployment logs: `doctl apps logs <app-id> <deployment-id> --type build` and `--type run`.
- The `cause` field on the failed deployment will say `app spec updated` (the rotation) — distinguishing it from a code-push deployment.
- Roll back via the DO UI: **Apps** → **blackglass** → **Activity** → find the previous deployment → **Rollback**. This reverts the entire spec including the env var, so you'll be on the OLD passphrase again. Not ideal but it gets you back to a working state while you debug.

## What this page deliberately doesn't promise

- **No self-serve unlock for end users.** This is an operator-only flow. End users (when the multi-tenant SaaS auth lands) will have a real forgot-password flow via Clerk; that's a different system.
- **No "we'll email you the existing one".** We can't — it's not stored in a form we can read.
- **No silent rotation.** Every rotation triggers an audible deployment event in the DO Activity feed and an `auth.login_failed` audit-log row when an old client tries the old passphrase. That's intentional — credential rotation should leave a paper trail.
