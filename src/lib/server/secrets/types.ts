export type ScanReason = "baseline" | "drift_scan";

export type ScanContext = {
  scanId: string;
  reason: ScanReason;
  hostCount: number;
  /** Logical name in the secret manager (Doppler key, Infisical secret name, Vault role path).
   *  When SECRET_PROVIDER=db this is the credential `label` (or UUID) inside `tenant_credentials`. */
  credentialRef?: string;
  /** When set, only these collector `hostId` values are contacted (e.g. from `POST /scans`). */
  filterHostIds?: string[];
  /** Tenant UUID — required when SECRET_PROVIDER=db so the DB provider can enforce RLS. */
  tenantId?: string;
};

export type ScanCredential =
  | {
      kind: "private_key";
      material: Buffer;
      passphrase?: Buffer;
      release: () => void;
    }
  | {
      kind: "ssh_certificate";
      privateKey: Buffer;
      certificate: string;
      serial?: string;
      release: () => void;
    };

export interface SecretProvider {
  fetchScanCredential(ctx: ScanContext): Promise<ScanCredential>;

  /** Optional: Vault (or similar) JIT issuance; v1 providers may omit. */
  issueCredential?(ctx: ScanContext): Promise<ScanCredential>;

  /** Optional: serial-based revocation (e.g. Vault); v1 providers may omit. */
  revokeCredential?(handle: { serial?: string }): Promise<void>;
}
