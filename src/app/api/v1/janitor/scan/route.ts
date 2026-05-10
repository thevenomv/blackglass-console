/**
 * POST /api/v1/janitor/scan — enqueue (or run inline) read-only inventory scan for any linked provider.
 * DigitalOcean, AWS, and GCP run inventory + idle scoring when credentials are linked.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { z } from "zod";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, checkJanitorScanRateForAccount, clientIp } from "@/lib/server/rate-limit";
import { dispatchJanitorAccountScan } from "@/lib/server/janitor/scan-dispatch";

const BodySchema = z
  .object({
    accountId: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many scan requests.", requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.manage", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      403,
      "saas_only",
      "Charon requires a hosted Blackglass workspace with Clerk.",
      requestId,
    );
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const tenantId = access.ctx.tenant.id;
  const { accountId } = parsed.data;

  if (!(await checkJanitorScanRateForAccount(tenantId, accountId))) {
    return jsonError(
      429,
      "rate_limited",
      "This account has exceeded the hourly Charon scan limit. Try again later.",
      requestId,
    );
  }

  return dispatchJanitorAccountScan({
    tenantId,
    accountId,
    requestId,
    actorUserId: access.ctx.userId,
  });
}
