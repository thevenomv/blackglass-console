/**
 * Per-tenant notification routing and webhook signing keys.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Per-tenant notification routing for drift alerts.  Single row per tenant
 * (enforced by the FK uniqueness on tenant_id).  Each column holds a
 * destination override; when null the env-var default is used.
 *
 * Use saas/notifications-service.ts to read this in code paths that previously
 * read process.env.{ALERT_EMAIL_TO,WEBHOOK_URLS,SLACK_ALERT_WEBHOOK_URL,PD_ROUTING_KEY}.
 */
export const saasTenantNotifications = pgTable("saas_tenant_notifications", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Comma-separated list of email addresses to alert on high-severity drift. */
  alertEmailTo: text("alert_email_to"),
  /** Comma-separated list of HTTP(S) outbound webhook destinations. */
  webhookUrls: text("webhook_urls"),
  /** Single Slack incoming-webhook URL for fleet-wide drift summaries. */
  slackWebhookUrl: text("slack_webhook_url"),
  /** PagerDuty Events v2 integration routing key. */
  pdRoutingKey: text("pd_routing_key"),
  /**
   * Active webhook HMAC signing key for this tenant.  When non-null this is
   * used in preference to the WEBHOOK_SECRET env var; per-tenant keys mean
   * one tenant's leaked key can't forge another tenant's payloads.
   */
  webhookSigningKey: text("webhook_signing_key"),
  /**
   * Previous signing key — kept valid during the rotation overlap window
   * (default 24h, overridable via ROTATION_OVERLAP_HOURS).  The dispatcher
   * emits both `X-Blackglass-Signature` (current) and
   * `X-Blackglass-Signature-Previous` (previous) headers while populated so
   * receivers can verify against either without a hard cutover.
   */
  webhookSigningKeyPrevious: text("webhook_signing_key_previous"),
  /**
   * Wall-clock time of the last rotation.  When `now() - rotated_at` exceeds
   * the overlap window the previous key is considered retired and the
   * `-Previous` header stops being emitted.
   */
  webhookSigningKeyRotatedAt: timestamp("webhook_signing_key_rotated_at", { withTimezone: true }),
  /**
   * Per-tenant override for the scheduled drift-events digest cadence.
   * Null = inherit the deployment-wide default (DRIFT_DIGEST_INTERVAL).
   * Allowed values: 'off' | 'daily' | 'weekly' (enforced by SQL CHECK
   * `saas_tenant_notifications_digest_cadence_chk`).
   */
  driftDigestCadence: text("drift_digest_cadence"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasTenantNotifications = typeof saasTenantNotifications.$inferSelect;
