/**
 * Charon linked-account providers. All three run read inventory + idle scoring
 * in `janitor-scan-job` (DigitalOcean, AWS EC2 multi-region, GCP compute disks/snapshots).
 */

export const JANITOR_CLOUD_PROVIDERS = ["do", "aws", "gcp"] as const;

export type JanitorCloudProvider = (typeof JANITOR_CLOUD_PROVIDERS)[number];

export function isJanitorCloudProvider(s: string): s is JanitorCloudProvider {
  return (JANITOR_CLOUD_PROVIDERS as readonly string[]).includes(s);
}

/** Providers with a read inventory + scoring path in `janitor-scan-job`. */
export function janitorProviderScanImplemented(p: JanitorCloudProvider): boolean {
  return p === "do" || p === "aws" || p === "gcp";
}

export function janitorProviderLabel(p: JanitorCloudProvider): string {
  switch (p) {
    case "do":
      return "DigitalOcean";
    case "aws":
      return "AWS";
    case "gcp":
      return "Google Cloud";
    default:
      return p;
  }
}
