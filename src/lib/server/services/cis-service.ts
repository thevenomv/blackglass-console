/**
 * Per-tenant CIS evidence-of-control mappings.
 *
 * Maps a tenant's CIS Controls / Sub-Controls to drift categories that act
 * as continuous evidence the control is enforced.  Surfaced as a "Controls"
 * tab on the Evidence page so auditors can see which control IDs each
 * tenant is monitoring and which drift stream backs each one.
 */

import { withTenantRls, schema, tryGetDb } from "@/db";
import { and, asc, eq } from "drizzle-orm";

const { saasCisMappings } = schema;

export type CisMappingStatus = "active" | "not_applicable" | "draft";

export interface CisMappingInput {
  controlId: string;
  controlTitle: string;
  driftCategory: string;
  status?: CisMappingStatus;
  notes?: string | null;
}

export interface CisMappingView {
  id: string;
  controlId: string;
  controlTitle: string;
  driftCategory: string;
  status: CisMappingStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToView(row: typeof saasCisMappings.$inferSelect): CisMappingView {
  return {
    id: row.id,
    controlId: row.controlId,
    controlTitle: row.controlTitle,
    driftCategory: row.driftCategory,
    status: row.status as CisMappingStatus,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCisMappings(tenantId: string): Promise<CisMappingView[]> {
  if (!tryGetDb()) return [];
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasCisMappings)
      .where(eq(saasCisMappings.tenantId, tenantId))
      .orderBy(asc(saasCisMappings.controlId)),
  );
  return rows.map(rowToView);
}

export async function upsertCisMapping(
  tenantId: string,
  actorUserId: string | null,
  input: CisMappingInput,
): Promise<CisMappingView> {
  const status: CisMappingStatus = input.status ?? "active";
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasCisMappings)
      .values({
        tenantId,
        controlId: input.controlId,
        controlTitle: input.controlTitle,
        driftCategory: input.driftCategory,
        status,
        notes: input.notes ?? null,
        createdBy: actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          saasCisMappings.tenantId,
          saasCisMappings.controlId,
          saasCisMappings.driftCategory,
        ],
        set: {
          controlTitle: input.controlTitle,
          status,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        },
      })
      .returning(),
  );
  return rowToView(row!);
}

export async function deleteCisMapping(tenantId: string, id: string): Promise<boolean> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .delete(saasCisMappings)
      .where(and(eq(saasCisMappings.tenantId, tenantId), eq(saasCisMappings.id, id)))
      .returning({ id: saasCisMappings.id }),
  );
  return rows.length > 0;
}
