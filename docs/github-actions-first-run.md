# GitHub Actions — first‑run cheatsheet

Assume [`gh`](https://cli.github.com/) is authenticated (`gh auth login`).

```bash
# Staging probe (manual URL overrides secret)

gh workflow run "Staging smoke" -f staging_url_override="https://your-staging-host.example"

# If STAGING_URL secret is already set:

gh workflow run "Staging smoke"

# Passive OWASP ZAP baseline (override optional)

gh workflow run "Security — ZAP baseline (DAST)" -f target_url_override="https://your-staging-host.example"

# Inspect last runs

gh run list --workflow "Staging smoke" --limit 5
```

**Secrets** (repository → Settings → Secrets and variables → Actions):

| Name | Purpose |
|------|---------|
| `STAGING_URL` | Canonical staging origin (`https://…`) for scheduled smoke + ZAP |
