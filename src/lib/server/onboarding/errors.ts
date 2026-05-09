/**
 * Error taxonomy for the first-baseline / push-agent flow.
 *
 * One source of truth — used by:
 *   - The agent-push route (POST /api/v1/ingest/agent) when returning 4xx/5xx
 *   - The onboarding wizard (renders the matching remedy)
 *   - The runbook (`docs/first-baseline-runbook.md`)
 *   - The agent install script (`/install-agent.sh`) when echoing the error
 *
 * If you add a code, add the remedy AND the runbook entry in the same PR.
 */

export type OnboardingErrorCode =
  // Authentication / authorization
  | "unauthorized"
  | "host_quota_exceeded"
  | "host_tombstoned"
  | "rate_limited"
  // Bundle integrity
  | "bundle_truncated"
  | "bundle_missing_sections"
  | "parse_failed"
  // Pipeline
  | "drift_pipeline_failed"
  // Configuration
  | "ingest_not_configured"
  | "ingest_scope_invalid"
  | "database_unavailable"
  // Validation
  | "validation_failed";

export type OnboardingError = {
  code: OnboardingErrorCode;
  /** HTTP status the API returns for this code. */
  status: number;
  /** One-line summary, safe for a toast. */
  detail: string;
  /** Specific guidance — what should the user actually do? */
  remedy: string;
};

const REMEDIES: Record<OnboardingErrorCode, { remedy: string; status: number }> = {
  unauthorized: {
    status: 401,
    remedy:
      "Confirm BLACKGLASS_API_KEY in /etc/blackglass-agent.env matches a key issued from /settings (Identity → API keys). Old keys still work until rotated; if you rotated, generate a new key and re-run the install command.",
  },
  host_quota_exceeded: {
    status: 403,
    remedy:
      "Your workspace has reached its host allowance. Delete an unused host from /hosts or upgrade your plan from /settings/billing, then re-run the agent.",
  },
  host_tombstoned: {
    status: 410,
    remedy:
      "This host was recently deleted from the dashboard. Open /onboarding and click 'Reset and reinstall' to clear the tombstone, or wait for it to expire (default 24h).",
  },
  rate_limited: {
    status: 429,
    remedy:
      "Too many ingests for this host in a short window. The agent's 5-minute systemd timer is the right cadence — disable any extra cron jobs or test loops.",
  },
  bundle_truncated: {
    status: 422,
    remedy:
      "The agent collected fewer bytes than expected. Most often the script timed out (slow systemctl, slow find). Re-run `sudo /usr/local/bin/blackglass-agent.sh` manually and check for stderr output.",
  },
  bundle_missing_sections: {
    status: 422,
    remedy:
      "The bundle is missing one or more required sections (listeners / users / ssh). Most often this is sudo not granting access to /etc/sudoers.d or sshd_config — confirm the agent runs as root and re-run the install script.",
  },
  parse_failed: {
    status: 422,
    remedy:
      "A bundle section was present but didn't match the expected format (likely a non-standard distro layout). File an issue with the section name from the error and we'll add a parser.",
  },
  drift_pipeline_failed: {
    status: 502,
    remedy:
      "The bundle parsed correctly but the drift pipeline failed (storage / database). Check the server logs; this usually means a transient database or storage outage and the next push will succeed.",
  },
  ingest_not_configured: {
    status: 503,
    remedy:
      "The console doesn't have INGEST_API_KEY set. An admin needs to set it in the deployment environment. If this is your console, run /settings → Identity → 'Generate push ingest API key'.",
  },
  ingest_scope_invalid: {
    status: 403,
    remedy:
      "INGEST_SAAS_TENANT_ID on the console doesn't match a real tenant. Operator-only; check the deployment env.",
  },
  database_unavailable: {
    status: 503,
    remedy:
      "Tenant-scoped ingest requires DATABASE_URL on the console. Operator-only; check the deployment env.",
  },
  validation_failed: {
    status: 400,
    remedy:
      "The agent-push payload was malformed. If you're running the standard agent script, this should never happen — please file an issue with the request body.",
  },
};

/** Build a fully-formed error object for a given code. */
export function onboardingError(
  code: OnboardingErrorCode,
  detail: string,
): OnboardingError {
  const meta = REMEDIES[code];
  return {
    code,
    status: meta.status,
    detail,
    remedy: meta.remedy,
  };
}

/** Look up the remedy text alone (used by the wizard's UI). */
export function onboardingRemedy(code: OnboardingErrorCode): string {
  return REMEDIES[code].remedy;
}

/** All known codes — used by docs generation and the wizard's troubleshooting block. */
export function allOnboardingCodes(): OnboardingErrorCode[] {
  return Object.keys(REMEDIES) as OnboardingErrorCode[];
}
