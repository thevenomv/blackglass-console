# Secret backends (adapters)

Each **`SecretProvider`** lives under **`providers/`** and is wired by **`factory.ts`** via `SECRET_PROVIDER`:

| Adapter   | File                            | Transport                                                                                                  |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `env`     | `env-secret-provider.ts`        | `SSH_PRIVATE_KEY` in process env (single-tenant / dev)                                                      |
| `doppler` | `doppler-secret-provider.ts`    | Doppler REST or CLI download                                                                                |
| `infisical`| `infisical-secret-provider.ts` | Infisical API                                                                                               |
| `vault`   | `vault-secret-provider.ts`      | Vault SSH sign + optional revoke                                                                            |
| `db`      | `db-secret-provider.ts`         | Per-tenant credentials in Postgres, **envelope-encrypted at rest** via `envelope.ts` (KMS-wrapped DEK).      |

When `SECRET_PROVIDER=db`, the KMS provider for the wrapping key is
selected by `KMS_PROVIDER`:

| `KMS_PROVIDER` | Description                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------- |
| `local`        | Symmetric key from `KMS_LOCAL_KEY` (base64, 32 B). For dev, single-node, or air-gapped pilots. |
| `vault`        | HashiCorp Vault Transit. Requires `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_TRANSIT_KEY`.            |
| `awskms`       | AWS KMS. Requires `AWS_REGION`, `KMS_KEY_ID`, AWS credentials in env.                          |

Add a new backend by implementing **`SecretProvider`** in `types.ts`,
registering it in **`factory.ts`**, and extending
**`credentialSourceConfigured`**, **`probe.ts`**, and unit tests. Add a
new KMS provider by implementing the interface in `envelope.ts` and
registering it in `kmsProvider()`.

## Per-tenant KMS / BYOK (Phase 1)

Some enterprise customers want their own KMS root key (in their own AWS
account / Vault cluster) used to wrap data-encryption keys for their
tenant. The data model for this lives in `saas_tenant_kms_keys`
(migration `0014_tenant_kms_keys.sql`) and the lookup helper in
`tenant-kms.ts`.

| Phase | Status      | Behaviour                                                                                              |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------ |
| 1     | **shipped** | Schema + `loadTenantKmsConfig()` + `BYOK_ENABLED` flag. `encryptKey()` / `decryptKey()` unchanged.     |
| 2     | TODO        | `envelope.ts` switches on `loadTenantKmsConfig(tenantId)` when `BYOK_ENABLED=true` and a row exists.   |
| 3     | TODO        | Settings UI: configure provider + key ref, run round-trip verification, display `last_verified_at`.    |

Phase 1 design notes:

- **Provider whitelist.** Only `awskms` and `vault` are allowed. The
  `local` provider is a developer convenience and would defeat the whole
  point of BYOK if a customer were ever pointed at it accidentally.
- **Wrapped provider creds.** When the deployment cannot authenticate to
  the customer KMS via ambient creds (IAM instance profile, Workload
  Identity, …), per-tenant credentials live in
  `provider_secret_encrypted` — wrapped by the **global** KMS, never
  plaintext at rest.
- **RLS scoped reads.** The lookup helper goes through `withTenantRls()`
  so even an accidental cross-tenant query gets filtered.
- **Operator visibility.** `tenantKmsStatus(tenantId)` returns a
  redacted summary suitable for the Settings → Identity surface — no
  secret material, just `provider`, `keyRef`, `lastVerifiedAt`.

Until Phase 2 lands, BYOK is purely a marketing / pre-sales unblock:
the schema exists, the flag exists, and we can sign a contract that
says "we ship per-tenant KMS in the next release window" with the data
plumbing already in place.
