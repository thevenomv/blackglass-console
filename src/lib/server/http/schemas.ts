import { z } from "zod";

export const ScanPostBodySchema = z.object({
  host_ids: z.array(z.string().min(1).max(256)).max(64).optional(),
});

export const AuditPostBodySchema = z.object({
  action: z.string().min(1).max(200).trim(),
  detail: z.string().min(1).max(16_000).trim(),
  actor: z.string().max(200).trim().optional(),
  scan_id: z.string().min(1).max(512).trim().optional(),
});

const optionalQueryTrimmed = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v == null) return undefined;
      const t = String(v).trim();
      return t === "" ? undefined : t.slice(0, max);
    });

/** GET /api/v1/audit/events?limit=&action=&since= */
export const AuditEventsQuerySchema = z.object({
  limit: z.preprocess((val: unknown) => {
    if (val === null || val === undefined || val === "") return 80;
    const n = typeof val === "string" ? Number(val.trim()) : Number(val);
    return Number.isFinite(n) ? n : NaN;
  }, z.number().int().min(1).max(200)),
  action: optionalQueryTrimmed(200),
  since: optionalQueryTrimmed(40),
});

const LIFECYCLES = [
  "new",
  "triaged",
  "accepted_risk",
  "remediated",
  "verified",
] as const;

/** GET /api/v1/drift?hostId=&lifecycle=&limit=&cursor= */
export const DriftQuerySchema = z.object({
  hostId: z.preprocess((val: unknown) => {
    if (val === null || val === undefined) return undefined;
    const s = String(val).trim();
    return s === "" ? undefined : s;
  }, z.string().min(1).max(512).optional()),
  lifecycle: z.preprocess((val: unknown) => {
    if (val === null || val === undefined) return undefined;
    const s = String(val).trim();
    return s === "" ? undefined : s;
  }, z.enum(LIFECYCLES).optional()),
  limit: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return 100;
      const n = typeof v === "string" ? Number(String(v).trim()) : Number(v);
      if (!Number.isFinite(n)) return 100;
      return Math.min(200, Math.max(1, Math.floor(n)));
    }),
  cursor: optionalQueryTrimmed(256),
});

/**
 * Path segments for scan jobs, evidence bundles, etc.
 * Allows UUIDs, dotted host-derived ids, and common slug characters.
 */
export const ResourceIdPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9._-]+$/);

// ---------------------------------------------------------------------------
// Push-agent ingest  (POST /api/v1/ingest)
// ---------------------------------------------------------------------------

// Zod sub-schemas mirroring HostSnapshot fields so we validate agent payloads
// at the API boundary before writing to the store.
const ListeningPortSchema = z.object({
  proto: z.enum(["tcp", "udp"]),
  bind: z.string().max(64),
  port: z.number().int().min(0).max(65535),
  process: z.string().max(256).optional(),
});

const LocalUserSchema = z.object({
  username: z.string().min(1).max(128),
  uid: z.number().int(),
});

const RunningServiceSchema = z.object({
  unit: z.string().min(1).max(256),
  sub: z.string().max(64),
});

const SSHConfigSchema = z.object({
  permitRootLogin: z.string().max(32),
  passwordAuthentication: z.string().max(32),
});

const FirewallStatusSchema = z.object({
  active: z.boolean(),
  defaultInbound: z.string().max(32),
  rules: z.array(z.string().max(512)).max(512),
});

const CronEntrySchema = z.object({
  filename: z.string().max(512),
});

export const IngestPayloadSchema = z.object({
  /** Stable identifier matching COLLECTOR_HOST_* config, e.g. "host-10-0-0-1" */
  hostId: ResourceIdPathSchema,
  hostname: z.string().min(1).max(253),
  collectedAt: z.string().datetime(),
  listeners: z.array(ListeningPortSchema).max(4096),
  users: z.array(LocalUserSchema).max(1024),
  sudoers: z.array(z.string().max(512)).max(512),
  cronEntries: z.array(CronEntrySchema).max(512),
  services: z.array(RunningServiceSchema).max(4096),
  ssh: SSHConfigSchema,
  firewall: FirewallStatusSchema,
});

export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
