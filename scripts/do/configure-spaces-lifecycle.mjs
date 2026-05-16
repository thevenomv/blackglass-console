#!/usr/bin/env node
/**
 * configure-spaces-lifecycle.mjs
 *
 * Applies S3-compatible lifecycle rules to the BLACKGLASS DigitalOcean Spaces
 * bucket so that old baselines, reports, and evidence bundles are automatically
 * transitioned / deleted per the data retention policy.
 *
 * Retention defaults (override via env vars):
 *   LIFECYCLE_BASELINE_TRANSITION_DAYS   — move baselines to cheaper storage (default: 30)
 *   LIFECYCLE_BASELINE_EXPIRE_DAYS       — delete baselines entirely (default: 180)
 *   LIFECYCLE_REPORT_EXPIRE_DAYS         — delete reports (default: 365)
 *   LIFECYCLE_EVIDENCE_EXPIRE_DAYS       — delete evidence bundles (default: 365)
 *
 * Required env vars (same as the app):
 *   DO_SPACES_ENDPOINT  — e.g. https://lon1.digitaloceanspaces.com
 *   DO_SPACES_BUCKET    — bucket name
 *   DO_SPACES_KEY       — access key ID
 *   DO_SPACES_SECRET    — secret access key
 *
 * Usage:
 *   node scripts/configure-spaces-lifecycle.mjs
 *   node scripts/configure-spaces-lifecycle.mjs --dry-run   # print rules without applying
 */

import { S3Client, PutBucketLifecycleConfigurationCommand, GetBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function envInt(name, def) {
  const v = process.env[name]?.trim();
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

const endpoint   = requireEnv("DO_SPACES_ENDPOINT");
const bucket     = requireEnv("DO_SPACES_BUCKET");
const accessKey  = requireEnv("DO_SPACES_KEY");
const secretKey  = requireEnv("DO_SPACES_SECRET");

const baselineTransitionDays = envInt("LIFECYCLE_BASELINE_TRANSITION_DAYS", 30);
const baselineExpireDays     = envInt("LIFECYCLE_BASELINE_EXPIRE_DAYS", 180);
const reportExpireDays       = envInt("LIFECYCLE_REPORT_EXPIRE_DAYS", 365);
const evidenceExpireDays     = envInt("LIFECYCLE_EVIDENCE_EXPIRE_DAYS", 365);

// ---------------------------------------------------------------------------
// Rules
// Note: DigitalOcean Spaces supports AbortIncompleteMultipartUpload,
// Expiration, and (on some plans) NoncurrentVersionExpiration.
// Transition to GLACIER is not supported on DO Spaces — Expiration is the
// lowest-cost disposal mechanism available.
// ---------------------------------------------------------------------------
const rules = [
  {
    ID: "baselines-expire",
    Status: "Enabled",
    Filter: { Prefix: "baselines/" },
    Expiration: { Days: baselineExpireDays },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
  },
  {
    ID: "reports-expire",
    Status: "Enabled",
    Filter: { Prefix: "reports/" },
    Expiration: { Days: reportExpireDays },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
  },
  {
    ID: "evidence-expire",
    Status: "Enabled",
    Filter: { Prefix: "evidence/" },
    Expiration: { Days: evidenceExpireDays },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
  },
  {
    // Clean up incomplete multipart uploads for all prefixes
    ID: "abort-incomplete-multipart",
    Status: "Enabled",
    Filter: { Prefix: "" },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
  },
];

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
const client = new S3Client({
  endpoint,
  region: "us-east-1", // DO Spaces requires this placeholder
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: false,
});

console.log(`\nBucket : ${bucket}`);
console.log(`Endpoint: ${endpoint}\n`);
console.log("Rules to apply:");
console.log(JSON.stringify(rules, null, 2));

if (DRY_RUN) {
  console.log("\n[dry-run] No changes applied.");
  process.exit(0);
}

// Show current lifecycle config before overwriting
try {
  const current = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
  console.log("\nExisting rules (will be replaced):");
  console.log(JSON.stringify(current.Rules ?? [], null, 2));
} catch (e) {
  if (e?.name === "NoSuchLifecycleConfiguration") {
    console.log("\nNo existing lifecycle configuration.");
  } else {
    console.warn("[warn] Could not fetch existing rules:", e?.message ?? e);
  }
}

await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: bucket,
    LifecycleConfiguration: { Rules: rules },
  }),
);

console.log(`\nLifecycle rules applied to ${bucket}:`);
console.log(`  baselines/  — expire after ${baselineExpireDays} days`);
console.log(`  reports/    — expire after ${reportExpireDays} days`);
console.log(`  evidence/   — expire after ${evidenceExpireDays} days`);
console.log("  abort-incomplete-multipart — 7 days");
