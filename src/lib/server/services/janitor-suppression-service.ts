/**
 * Charon finding suppressions — dismiss or snooze by (account, resource_type, resource_id).
 */

import { and, desc, eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorFindings, janitorResourceSuppressions } from "@/db/schema";

type JanitorFindingInsert = typeof janitorFindings.$inferInsert;

export type SuppressionKind = "dismiss" | "snooze";

export async function listJanitorSuppressions(
  tenantId: string,
  accountId?: string,
): Promise<(typeof janitorResourceSuppressions.$inferSelect)[]> {
  return withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(janitorResourceSuppressions)
      .where(
        accountId
          ? and(
              eq(janitorResourceSuppressions.tenantId, tenantId),
              eq(janitorResourceSuppressions.accountId, accountId),
            )
          : eq(janitorResourceSuppressions.tenantId, tenantId),
      )
      .orderBy(desc(janitorResourceSuppressions.createdAt))
      .limit(500),
  );
}

export async function deleteJanitorSuppression(
  tenantId: string,
  suppressionId: string,
): Promise<boolean> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .delete(janitorResourceSuppressions)
      .where(
        and(
          eq(janitorResourceSuppressions.id, suppressionId),
          eq(janitorResourceSuppressions.tenantId, tenantId),
        ),
      )
      .returning({ id: janitorResourceSuppressions.id }),
  );
  return rows.length > 0;
}

/** Remove finding row and upsert suppression so the next scan skips this resource. */
export async function suppressJanitorFinding(opts: {
  tenantId: string;
  findingId: string;
  userId: string;
  kind: SuppressionKind;
  snoozeUntil?: Date | null;
  note?: string | null;
}): Promise<void> {
  const { tenantId, findingId, userId, kind, snoozeUntil, note } = opts;
  if (kind === "snooze" && (!snoozeUntil || !(snoozeUntil instanceof Date) || snoozeUntil <= new Date())) {
    throw new Error("snooze_until_invalid");
  }

  await withTenantRls(tenantId, async (db) => {
    const [finding] = await db
      .select({
        id: janitorFindings.id,
        accountId: janitorFindings.accountId,
        resourceType: janitorFindings.resourceType,
        resourceId: janitorFindings.resourceId,
      })
      .from(janitorFindings)
      .where(and(eq(janitorFindings.id, findingId), eq(janitorFindings.tenantId, tenantId)))
      .limit(1);

    if (!finding) {
      throw new Error("finding_not_found");
    }

    await db
      .insert(janitorResourceSuppressions)
      .values({
        tenantId,
        accountId: finding.accountId,
        resourceType: finding.resourceType,
        resourceId: finding.resourceId,
        kind,
        snoozeUntil: kind === "snooze" ? snoozeUntil! : null,
        note: note?.trim() || null,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [
          janitorResourceSuppressions.accountId,
          janitorResourceSuppressions.resourceType,
          janitorResourceSuppressions.resourceId,
        ],
        set: {
          kind,
          snoozeUntil: kind === "snooze" ? snoozeUntil! : null,
          note: note?.trim() || null,
          createdByUserId: userId,
          createdAt: new Date(),
        },
      });

    await db.delete(janitorFindings).where(eq(janitorFindings.id, finding.id));
  });
}

export function filterFindingsBySuppressions(
  rows: JanitorFindingInsert[],
  suppressions: (typeof janitorResourceSuppressions.$inferSelect)[],
  now: Date,
): JanitorFindingInsert[] {
  const blocked = new Set<string>();
  for (const s of suppressions) {
    const k = `${s.accountId}|${s.resourceType}|${s.resourceId}`;
    if (s.kind === "dismiss") {
      blocked.add(k);
      continue;
    }
    if (s.kind === "snooze" && s.snoozeUntil && s.snoozeUntil > now) {
      blocked.add(k);
    }
  }
  return rows.filter((row) => !blocked.has(`${row.accountId}|${row.resourceType}|${row.resourceId}`));
}
