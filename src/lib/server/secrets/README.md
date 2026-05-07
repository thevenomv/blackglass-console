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
