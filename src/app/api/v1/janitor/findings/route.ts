/**
 * GET /api/v1/janitor/findings — paginated idle-resource findings
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts, janitorFindings } from "@/db/schema";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.read", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ findings: [] }, { headers: { "x-request-id": requestId } });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? "50", 10) || 50),
  );
  const offsetParam = url.searchParams.get("offset");
  const offset =
    offsetParam !== null && offsetParam !== ""
      ? Math.max(0, parseInt(offsetParam, 10) || 0)
      : (page - 1) * pageSize;

  const accountId = url.searchParams.get("accountId")?.trim();
  const resourceTypeRaw = url.searchParams.get("resourceType")?.trim().toLowerCase();
  const minScoreRaw = url.searchParams.get("minScore");
  const minScore =
    minScoreRaw !== null && minScoreRaw !== ""
      ? Math.min(100, Math.max(0, parseInt(minScoreRaw, 10) || 0))
      : undefined;

  const tenantId = access.ctx.tenant.id;

  const charonResourceTypes = new Set([
    "droplet",
    "volume",
    "snapshot",
    "ec2_instance",
    "ebs_volume",
    "ebs_snapshot",
    "gce_disk",
    "gce_snapshot",
  ]);

  const conditions = [eq(janitorFindings.tenantId, tenantId)];
  if (accountId && /^[0-9a-f-]{36}$/i.test(accountId)) {
    conditions.push(eq(janitorFindings.accountId, accountId));
  }
  if (resourceTypeRaw && charonResourceTypes.has(resourceTypeRaw)) {
    conditions.push(eq(janitorFindings.resourceType, resourceTypeRaw));
  }
  if (minScore !== undefined) {
    conditions.push(gte(janitorFindings.idleScore, minScore));
  }
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [totalRow] = await withTenantRls(tenantId, (db) =>
    db
      .select({ n: count() })
      .from(janitorFindings)
      .innerJoin(janitorAccounts, eq(janitorFindings.accountId, janitorAccounts.id))
      .where(whereClause),
  );
  const total = Number(totalRow?.n ?? 0);

  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        id: janitorFindings.id,
        tenantId: janitorFindings.tenantId,
        accountId: janitorFindings.accountId,
        resourceType: janitorFindings.resourceType,
        resourceId: janitorFindings.resourceId,
        resourceName: janitorFindings.resourceName,
        idleScore: janitorFindings.idleScore,
        estimatedWasteMonthly: janitorFindings.estimatedWasteMonthly,
        tags: janitorFindings.tags,
        metricsMeta: janitorFindings.metricsMeta,
        createdAt: janitorFindings.createdAt,
        provider: janitorAccounts.provider,
      })
      .from(janitorFindings)
      .innerJoin(janitorAccounts, eq(janitorFindings.accountId, janitorAccounts.id))
      .where(whereClause)
      .orderBy(desc(janitorFindings.idleScore), desc(janitorFindings.createdAt))
      .limit(pageSize)
      .offset(offset),
  );

  return NextResponse.json(
    {
      findings: rows,
      pagination: {
        page: offsetParam !== null && offsetParam !== "" ? Math.floor(offset / pageSize) + 1 : page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      limit: pageSize,
      offset,
    },
    { headers: { "x-request-id": requestId } },
  );
}
