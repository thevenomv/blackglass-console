/**
 * Shared copy for trial read-only and subscription blocks (API error.detail + UI).
 * Keep messages aligned with server enforcement in operations.ts / route handlers.
 */
export const TRIAL_READ_ONLY = {
  scans: "Trial ended — scans are disabled. Upgrade to restore operational workflows.",
  hosts: "Trial ended — host enrollment and changes are read-only until you upgrade.",
  baselines: "Trial ended — baseline capture is disabled until you upgrade.",
  secrets: "Trial ended — collector and secret rotation require an active plan.",
  reports: "Trial ended — report generation is paused until you upgrade.",
  auditAppend: "Trial ended — investigation notes cannot be appended until you upgrade.",
  billing: "Trial ended — billing changes require an active plan (read-only workspace).",
  generic: "This workspace is read-only until billing is restored.",
} as const;

export type TrialMessageKey = keyof typeof TRIAL_READ_ONLY;
