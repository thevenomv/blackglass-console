/**
 * Client-safe mirror of `src/lib/server/onboarding/errors.ts`.
 *
 * The wizard needs to render remedies in the troubleshooting block and
 * when the API responds with an error code. We can't import the server
 * file directly (it pulls in node:fs etc. via transitive deps) so we
 * keep a small parallel table here. CI test (`tests/unit/onboarding-error-parity.test.ts`)
 * asserts every server code is present here so the two never drift.
 */

export type OnboardingTip = {
  code: string;
  title: string;
  remedy: string;
};

export const ONBOARDING_TIPS: OnboardingTip[] = [
  {
    code: "unauthorized",
    title: "API key was rejected",
    remedy:
      "Confirm BLACKGLASS_API_KEY in /etc/blackglass-agent.env matches a key issued from Settings → Identity → API keys. If you rotated the key, re-run the install command with the new one.",
  },
  {
    code: "host_quota_exceeded",
    title: "Host allowance reached",
    remedy:
      "Your workspace has hit its host limit. Delete an unused host from /hosts or upgrade your plan from /settings/billing, then re-run the agent.",
  },
  {
    code: "host_tombstoned",
    title: "Host was recently deleted",
    remedy:
      "Click 'Reset and reinstall' below to clear the tombstone, then re-run the install command on the host. Tombstones expire automatically after 24h.",
  },
  {
    code: "rate_limited",
    title: "Too many pushes for this host",
    remedy:
      "The agent's 5-minute systemd timer is the right cadence — disable any extra cron jobs or test loops, then wait one minute and retry.",
  },
  {
    code: "bundle_truncated",
    title: "Agent collected too little data",
    remedy:
      "The collection script likely timed out (slow systemctl, slow find). Re-run `sudo /usr/local/bin/blackglass-agent.sh` manually on the host and check the stderr output.",
  },
  {
    code: "bundle_missing_sections",
    title: "Bundle is missing critical sections",
    remedy:
      "Most often this is sudo not granting access to /etc/sudoers.d or sshd_config. Confirm the agent runs as root and re-run the install script.",
  },
  {
    code: "parse_failed",
    title: "Bundle section couldn't be parsed",
    remedy:
      "A bundle section was present but didn't match the expected format (likely a non-standard distro). File an issue with the section name and we'll add a parser.",
  },
  {
    code: "drift_pipeline_failed",
    title: "Snapshot accepted, drift pipeline failed",
    remedy:
      "Usually a transient database or storage outage. The next push (in ~5 minutes) will retry automatically.",
  },
  {
    code: "ingest_not_configured",
    title: "Console isn't configured for push ingest",
    remedy:
      "An admin needs to set INGEST_API_KEY in the deployment environment. From the wizard, click 'Generate API key' and the system will write it for you.",
  },
];

export function tipForCode(code: string): OnboardingTip | undefined {
  return ONBOARDING_TIPS.find((t) => t.code === code);
}
