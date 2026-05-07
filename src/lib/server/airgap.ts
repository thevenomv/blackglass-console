/**
 * Air-gapped install mode.
 *
 * Some customers run BLACKGLASS on networks that have no outbound
 * internet access at all. In that mode any HTTP call to a third-party
 * SaaS — Slack, PagerDuty, Datadog, OpenAI, Resend, Sentry — will
 * either time out or be blocked by the customer's egress firewall and
 * fail noisily.
 *
 * Setting `BLACKGLASS_AIRGAPPED=true` short-circuits every outbound
 * code path with a single info-level log and a successful no-op
 * return so:
 *   - the request hot path doesn't see network errors leak through
 *   - delivery-attempt counters / Sentry don't get spammed with
 *     hopeless retries
 *   - the operator sees one clear log line per integration confirming
 *     it was skipped (so it never looks like silent failure)
 *
 * What stays on:
 *   - The OpenTelemetry OTLP exporter (`OTEL_EXPORTER_OTLP_ENDPOINT`)
 *     because in an air-gapped deployment it almost always points at
 *     an internal collector.
 *   - Webhook *receivers* (Stripe, Clerk) — they're inbound, not
 *     outbound, so the air-gap doesn't apply.
 *   - The drift remediator (`REMEDIATOR_URL`) when it points at an
 *     internal hostname; we whitelist any URL that resolves to
 *     localhost / RFC1918 / link-local. Public-internet remediator
 *     URLs are rejected the same way other outbound calls are.
 *
 * The flag itself is read on every call, not cached, so an operator
 * can flip it via env update + restart without rebuilding the image.
 */

const PRIVATE_HOSTS_RE =
  /^(localhost|127\.|::1|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * True when `BLACKGLASS_AIRGAPPED` is set to a truthy value. Accepts
 * `true / 1 / yes` (case-insensitive) for forgiveness with shell
 * escaping habits.
 */
export function isAirgapped(): boolean {
  const raw = process.env.BLACKGLASS_AIRGAPPED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * True when the URL points at an internal host the air-gap allow-list
 * permits. Used to let the remediator + a self-hosted Sentry stay
 * functional while still blocking any URL that would leave the
 * cluster.
 */
export function isInternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (PRIVATE_HOSTS_RE.test(host)) return true;
    // .internal / .local / .svc.cluster.local — common on k8s
    // clusters running Cilium / Istio / vanilla CoreDNS.
    if (host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".svc.cluster.local")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper used by the dispatchers. Returns true (call should be skipped)
 * when air-gapped mode is on AND the URL is not an allow-listed
 * internal host. Logs once per integration so it's obvious why the
 * call didn't go out.
 */
export function shouldSkipForAirgap(integration: string, url?: string): boolean {
  if (!isAirgapped()) return false;
  if (url && isInternalUrl(url)) return false;
  console.info(
    `[airgap] Skipping ${integration} call${url ? ` to ${new URL(url).hostname}` : ""} — BLACKGLASS_AIRGAPPED is on.`,
  );
  return true;
}

/**
 * Surfaced in the Settings UI so the operator can verify the mode is
 * active without grepping logs. Returns null when not air-gapped.
 */
export function airgapStatus(): null | {
  enabled: boolean;
  whitelistedHostPatterns: string[];
} {
  if (!isAirgapped()) return null;
  return {
    enabled: true,
    whitelistedHostPatterns: [
      "localhost",
      "127.0.0.0/8",
      "169.254.0.0/16 (link-local + cloud metadata)",
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "*.internal",
      "*.local",
      "*.svc.cluster.local",
    ],
  };
}
