# Secret backends (adapters)

Each **`SecretProvider`** lives under **`providers/`** and is wired by **`factory.ts`** via `SECRET_PROVIDER`:

| Adapter | File | Transport |
|--------|------|-------------|
| `env` | `env-secret-provider.ts` | `SSH_PRIVATE_KEY` in process env |
| `doppler` | `doppler-secret-provider.ts` | Doppler REST or CLI download |
| `infisical` | `infisical-secret-provider.ts` | Infisical API |
| `vault` | `vault-secret-provider.ts` | Vault SSH sign + optional revoke |

Add a new backend by implementing **`SecretProvider`** in `types.ts`, registering it in **`factory.ts`**, and extending **`credentialSourceConfigured`**, **`probe.ts`**, and unit tests.
