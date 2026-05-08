/**
 * Per-tenant notification settings — single source of truth for outbound
 * routing (email, webhook, Slack, PagerDuty).
 *
 * Reads fall back to environment variables when the DB row is absent or the
 * specific column is null, so legacy single-tenant deployments keep working
 * unchanged.
 *
 * Use these helpers from any server-side path (scan worker, route handlers)
 * — never read the env vars directly outside of this file.
 */

import { randomBytes, createHash } from "node:crypto";
import { withBypassRls, withTenantRls, schema, tryGetDb } from "@/db";
import { eq } from "drizzle-orm";

const { saasTenantNotifications } = schema;

/**
 * Per-platform integration credentials. Each one is optional; if the
 * corresponding webhook URL doesn't appear in `webhookUrls`, the credential
 * stays unused. Stored as env vars today (per-tenant DB columns are a
 * follow-on); the type itself is the contract for both env + DB sources.
 */
export interface IntegrationCredentials {
  /** ServiceNow Basic auth — `<user>:<password>` */
  servicenowAuth: string | null;
  /** Jira Basic auth — `<email>:<api-token>`; project key comes via env JIRA_PROJECT_KEY */
  jiraAuth: string | null;
  jiraProjectKey: string | null;
  /** Datadog API key, sent as `DD-API-KEY` header */
  datadogApiKey: string | null;
  /** Linear personal API key, sent as `Authorization: <key>` */
  linearApiKey: string | null;
  /** Linear team UUID — required for issue creation */
  linearTeamId: string | null;
  /** GitHub PAT or app token, sent as `Authorization: Bearer <token>` */
  githubToken: string | null;
  /** Splunk HEC token, sent as `Authorization: Splunk <token>` */
  splunkHecToken: string | null;
  /**
   * AWS account id — used as ASFF `AwsAccountId` field. Customers who route
   * through a Lambda relay set this so findings carry the right account.
   */
  awsAccountId: string | null;
  /**
   * AWS region for the ASFF `Resources[].Region` field + the Security Hub
   * `ProductArn` template. Defaults to "us-east-1" when null.
   */
  awsRegion: string | null;
}

export interface NotificationRouting extends IntegrationCredentials {
  alertEmailTo: string | null;
  webhookUrls: string[];
  slackWebhookUrl: string | null;
  pdRoutingKey: string | null;
  /**
   * Resolved webhook HMAC signing key for this tenant — either the
   * per-tenant key from the DB or the WEBHOOK_SECRET env fallback. Nullable
   * when neither is set; in that case the dispatcher omits the signature
   * header entirely.
   */
  webhookSigningKey: string | null;
  /**
   * Previous signing key while inside the rotation overlap window (see
   * `ROTATION_OVERLAP_HOURS`, default 24h). Returned as null once the
   * overlap window has elapsed so the dispatcher stops dual-signing.
   */
  webhookSigningKeyPrevious: string | null;
  /**
   * Per-tenant override of the drift-digest opt-out toggle.
   * 'off' → don't email this tenant; null → inherit deployment default.
   */
  driftDigestCadence: string | null;
}

/**
 * Hours the previous signing key remains valid after a rotation. Receivers
 * can verify either signature during this window so they have time to roll
 * their stored key over.
 */
function rotationOverlapHours(): number {
  const raw = Number(process.env.ROTATION_OVERLAP_HOURS ?? 24);
  if (!Number.isFinite(raw) || raw < 0) return 24;
  // Cap at 7 days — keeping a key alive longer than that is bad hygiene.
  return Math.min(raw, 24 * 7);
}

function isPreviousKeyStillValid(rotatedAt: Date | null | undefined): boolean {
  if (!rotatedAt) return false;
  const ageMs = Date.now() - rotatedAt.getTime();
  if (ageMs < 0) return false;
  return ageMs < rotationOverlapHours() * 3600 * 1000;
}

function envFallback(): NotificationRouting {
  return {
    alertEmailTo: process.env.ALERT_EMAIL_TO?.trim() || null,
    webhookUrls: (process.env.WEBHOOK_URLS ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://")),
    slackWebhookUrl: process.env.SLACK_ALERT_WEBHOOK_URL?.trim() || null,
    pdRoutingKey: process.env.PD_ROUTING_KEY?.trim() || null,
    servicenowAuth: process.env.SERVICENOW_AUTH?.trim() || null,
    jiraAuth: process.env.JIRA_AUTH?.trim() || null,
    jiraProjectKey: process.env.JIRA_PROJECT_KEY?.trim() || null,
    datadogApiKey: process.env.DD_API_KEY?.trim() || null,
    linearApiKey: process.env.LINEAR_API_KEY?.trim() || null,
    linearTeamId: process.env.LINEAR_TEAM_ID?.trim() || null,
    githubToken: process.env.GITHUB_TOKEN?.trim() || null,
    splunkHecToken: process.env.SPLUNK_HEC_TOKEN?.trim() || null,
    awsAccountId: process.env.AWS_ACCOUNT_ID?.trim() || null,
    awsRegion: process.env.AWS_REGION?.trim() || null,
    // Single shared deployment-wide secret — kept for backwards compat with
    // single-tenant deployments. Per-tenant keys override it at the row level.
    webhookSigningKey: process.env.WEBHOOK_SECRET?.trim() || null,
    webhookSigningKeyPrevious: null,
    driftDigestCadence: null,
  };
}

/**
 * Read tenant routing — falls back to env vars per column.  Safe to call
 * during a scan worker run (uses bypass RLS — the worker is trusted server
 * code with no per-request tenant context).
 */
export async function getTenantNotifications(
  tenantId: string | undefined,
): Promise<NotificationRouting> {
  const fallback = envFallback();
  if (!tenantId || !tryGetDb()) return fallback;

  try {
    const rows = await withBypassRls((db) =>
      db
        .select()
        .from(saasTenantNotifications)
        .where(eq(saasTenantNotifications.tenantId, tenantId))
        .limit(1),
    );
    const row = rows[0];
    if (!row) return fallback;

    const webhookUrls = row.webhookUrls
      ? row.webhookUrls
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
      : fallback.webhookUrls;

    return {
      alertEmailTo: row.alertEmailTo?.trim() || fallback.alertEmailTo,
      webhookUrls,
      slackWebhookUrl: row.slackWebhookUrl?.trim() || fallback.slackWebhookUrl,
      pdRoutingKey: row.pdRoutingKey?.trim() || fallback.pdRoutingKey,
      // Integration credentials still env-only; per-tenant DB columns are a
      // follow-on. Falling through to envFallback keeps the env story consistent
      // with PagerDuty's existing pattern above.
      servicenowAuth: fallback.servicenowAuth,
      jiraAuth: fallback.jiraAuth,
      jiraProjectKey: fallback.jiraProjectKey,
      datadogApiKey: fallback.datadogApiKey,
      linearApiKey: fallback.linearApiKey,
      linearTeamId: fallback.linearTeamId,
      githubToken: fallback.githubToken,
      splunkHecToken: fallback.splunkHecToken,
      awsAccountId: fallback.awsAccountId,
      awsRegion: fallback.awsRegion,
      // Per-tenant signing key wins over the env-var WEBHOOK_SECRET; the
      // previous key is only honoured while inside the rotation overlap.
      webhookSigningKey: row.webhookSigningKey?.trim() || fallback.webhookSigningKey,
      webhookSigningKeyPrevious:
        row.webhookSigningKey && isPreviousKeyStillValid(row.webhookSigningKeyRotatedAt)
          ? row.webhookSigningKeyPrevious?.trim() || null
          : null,
      driftDigestCadence: row.driftDigestCadence?.trim() || null,
    };
  } catch (err) {
    console.error("[notifications-service] Read failed, falling back to env:", err);
    return fallback;
  }
}

/**
 * Read the routing for a tenant from a request handler under tenant RLS — use
 * this from API routes that already established a tenant context.
 */
export async function getTenantNotificationsRls(
  tenantId: string,
): Promise<NotificationRouting> {
  if (!tryGetDb()) return envFallback();
  try {
    const rows = await withTenantRls(tenantId, (db) =>
      db
        .select()
        .from(saasTenantNotifications)
        .where(eq(saasTenantNotifications.tenantId, tenantId))
        .limit(1),
    );
    const row = rows[0];
    const fallback = envFallback();
    if (!row) return fallback;
    const webhookUrls = row.webhookUrls
      ? row.webhookUrls
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
      : fallback.webhookUrls;
    return {
      alertEmailTo: row.alertEmailTo?.trim() || fallback.alertEmailTo,
      webhookUrls,
      slackWebhookUrl: row.slackWebhookUrl?.trim() || fallback.slackWebhookUrl,
      pdRoutingKey: row.pdRoutingKey?.trim() || fallback.pdRoutingKey,
      servicenowAuth: fallback.servicenowAuth,
      jiraAuth: fallback.jiraAuth,
      jiraProjectKey: fallback.jiraProjectKey,
      datadogApiKey: fallback.datadogApiKey,
      linearApiKey: fallback.linearApiKey,
      linearTeamId: fallback.linearTeamId,
      githubToken: fallback.githubToken,
      splunkHecToken: fallback.splunkHecToken,
      awsAccountId: fallback.awsAccountId,
      awsRegion: fallback.awsRegion,
      webhookSigningKey: row.webhookSigningKey?.trim() || fallback.webhookSigningKey,
      webhookSigningKeyPrevious:
        row.webhookSigningKey && isPreviousKeyStillValid(row.webhookSigningKeyRotatedAt)
          ? row.webhookSigningKeyPrevious?.trim() || null
          : null,
      driftDigestCadence: row.driftDigestCadence?.trim() || null,
    };
  } catch (err) {
    console.error("[notifications-service] Tenant read failed:", err);
    return envFallback();
  }
}

/**
 * Upsert the routing settings for a tenant.  Empty / whitespace strings are
 * stored as null so the env fallback kicks back in.
 */
export async function setTenantNotifications(
  tenantId: string,
  patch: Partial<{
    alertEmailTo: string | null;
    webhookUrls: string | null;
    slackWebhookUrl: string | null;
    pdRoutingKey: string | null;
    /** 'off' | null. Other values are rejected at the API layer. */
    driftDigestCadence: string | null;
  }>,
): Promise<void> {
  const norm = (v: string | null | undefined): string | null => {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  };

  await withTenantRls(tenantId, (db) =>
    db
      .insert(saasTenantNotifications)
      .values({
        tenantId,
        alertEmailTo: norm(patch.alertEmailTo),
        webhookUrls: norm(patch.webhookUrls),
        slackWebhookUrl: norm(patch.slackWebhookUrl),
        pdRoutingKey: norm(patch.pdRoutingKey),
        driftDigestCadence: norm(patch.driftDigestCadence),
      })
      .onConflictDoUpdate({
        target: saasTenantNotifications.tenantId,
        set: {
          alertEmailTo: norm(patch.alertEmailTo),
          webhookUrls: norm(patch.webhookUrls),
          slackWebhookUrl: norm(patch.slackWebhookUrl),
          pdRoutingKey: norm(patch.pdRoutingKey),
          driftDigestCadence: norm(patch.driftDigestCadence),
          updatedAt: new Date(),
        },
      }),
  );
}

// ---------------------------------------------------------------------------
// Per-tenant signing-key rotation
// ---------------------------------------------------------------------------

/**
 * Mint a fresh signing key.  64 bytes of CSPRNG output rendered as hex —
 * 512 bits of entropy is well above HMAC-SHA256's strength ceiling (256
 * bits) and matches the format Stripe / GitHub use for webhook secrets.
 */
function mintSigningKey(): string {
  return randomBytes(64).toString("hex");
}

/**
 * SHA-256 fingerprint of a signing key — the *only* representation the UI
 * surfaces. Showing the actual key in the UI even once would put it in
 * browser memory / DOM screenshots / screen-share recordings.
 */
export function fingerprintSigningKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

export interface SigningKeyStatus {
  hasKey: boolean;
  /** First 16 hex chars of SHA-256(current key). null when no key set. */
  fingerprint: string | null;
  /** First 16 hex chars of SHA-256(previous key) — null outside the overlap window. */
  previousFingerprint: string | null;
  rotatedAt: string | null;
  /** Whether the previous key is still being honoured by the dispatcher. */
  previousActive: boolean;
  overlapHours: number;
}

/**
 * Inspect the current signing-key state for a tenant, without ever
 * returning the raw key to the caller.  Used by the Settings UI.
 */
export async function getSigningKeyStatus(tenantId: string): Promise<SigningKeyStatus> {
  if (!tryGetDb()) {
    const env = process.env.WEBHOOK_SECRET?.trim() ?? "";
    return {
      hasKey: env.length > 0,
      fingerprint: env.length > 0 ? fingerprintSigningKey(env) : null,
      previousFingerprint: null,
      rotatedAt: null,
      previousActive: false,
      overlapHours: rotationOverlapHours(),
    };
  }
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        webhookSigningKey: saasTenantNotifications.webhookSigningKey,
        webhookSigningKeyPrevious: saasTenantNotifications.webhookSigningKeyPrevious,
        webhookSigningKeyRotatedAt: saasTenantNotifications.webhookSigningKeyRotatedAt,
      })
      .from(saasTenantNotifications)
      .where(eq(saasTenantNotifications.tenantId, tenantId))
      .limit(1),
  );
  const row = rows[0];
  const overlapHours = rotationOverlapHours();
  if (!row || !row.webhookSigningKey) {
    const env = process.env.WEBHOOK_SECRET?.trim() ?? "";
    return {
      hasKey: env.length > 0,
      fingerprint: env.length > 0 ? fingerprintSigningKey(env) : null,
      previousFingerprint: null,
      rotatedAt: null,
      previousActive: false,
      overlapHours,
    };
  }
  const previousActive = isPreviousKeyStillValid(row.webhookSigningKeyRotatedAt);
  return {
    hasKey: true,
    fingerprint: fingerprintSigningKey(row.webhookSigningKey),
    previousFingerprint:
      previousActive && row.webhookSigningKeyPrevious
        ? fingerprintSigningKey(row.webhookSigningKeyPrevious)
        : null,
    rotatedAt: row.webhookSigningKeyRotatedAt
      ? row.webhookSigningKeyRotatedAt.toISOString()
      : null,
    previousActive: previousActive && Boolean(row.webhookSigningKeyPrevious),
    overlapHours,
  };
}

/**
 * Rotate the signing key for a tenant.  Slides the current key into the
 * `previous` slot (kept valid for ROTATION_OVERLAP_HOURS), mints a new
 * current key, stamps the rotation time, and returns the *new* key so the
 * caller can show it once to the operator.  After this returns the raw key
 * is unrecoverable — clients have to refer to it by fingerprint.
 */
export async function rotateTenantSigningKey(tenantId: string): Promise<{
  newKey: string;
  fingerprint: string;
  rotatedAt: string;
}> {
  if (!tryGetDb()) {
    throw new Error("Per-tenant signing keys require a database; running with WEBHOOK_SECRET only.");
  }
  const newKey = mintSigningKey();
  const now = new Date();

  // We need the old key (if any) to slide into `previous`. Use a single
  // round-trip with a FOR UPDATE-style read+write under the tenant RLS.
  await withTenantRls(tenantId, async (db) => {
    const existing = await db
      .select({
        current: saasTenantNotifications.webhookSigningKey,
      })
      .from(saasTenantNotifications)
      .where(eq(saasTenantNotifications.tenantId, tenantId))
      .limit(1);

    const previousKey = existing[0]?.current ?? null;

    await db
      .insert(saasTenantNotifications)
      .values({
        tenantId,
        webhookSigningKey: newKey,
        webhookSigningKeyPrevious: previousKey,
        webhookSigningKeyRotatedAt: now,
      })
      .onConflictDoUpdate({
        target: saasTenantNotifications.tenantId,
        set: {
          webhookSigningKey: newKey,
          webhookSigningKeyPrevious: previousKey,
          webhookSigningKeyRotatedAt: now,
          updatedAt: now,
        },
      });
  });

  return {
    newKey,
    fingerprint: fingerprintSigningKey(newKey),
    rotatedAt: now.toISOString(),
  };
}
