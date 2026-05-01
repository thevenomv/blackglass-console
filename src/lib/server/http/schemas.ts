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

/** GET /api/v1/audit/events?limit= */
export const AuditEventsQuerySchema = z.object({
  limit: z.preprocess((val: unknown) => {
    if (val === null || val === undefined || val === "") return 80;
    const n = typeof val === "string" ? Number(val.trim()) : Number(val);
    return Number.isFinite(n) ? n : NaN;
  }, z.number().int().min(1).max(200)),
});

const LIFECYCLES = [
  "new",
  "triaged",
  "accepted_risk",
  "remediated",
  "verified",
] as const;

/** GET /api/v1/drift?hostId=&lifecycle= */
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
