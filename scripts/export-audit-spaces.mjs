#!/usr/bin/env node
/**
 * List + download Spaces objects under audit/ prefix (NDJSON bundles).
 *
 * Requires same env as app: DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT,
 * DO_SPACES_BUCKET, optional DO_SPACES_REGION.
 *
 * Usage:
 *   node scripts/export-audit-spaces.mjs > ./audit-export.ndjson
 *   node scripts/export-audit-spaces.mjs --prefix audit/2026-05-
 */
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

function client() {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  if (!key || !secret || !endpoint) {
    console.error("Missing DO_SPACES_KEY / DO_SPACES_SECRET / DO_SPACES_ENDPOINT");
    process.exit(1);
  }
  const region =
    process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

const prefix =
  process.argv.includes("--prefix") ?
    process.argv[process.argv.indexOf("--prefix") + 1] ?? "audit/"
  : "audit/";

async function main() {
  const c = client();
  const bucket = process.env.DO_SPACES_BUCKET ?? "";
  if (!bucket) {
    console.error("DO_SPACES_BUCKET is not set");
    process.exit(1);
  }
  let token;
  do {
    const out = await c.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (!obj.Key?.endsWith(".jsonl")) continue;
      const body = await c.send(
        new GetObjectCommand({ Bucket: bucket, Key: obj.Key }),
      );
      const text = (await body.Body?.transformToString()) ?? "";
      process.stdout.write(`\n# --- ${obj.Key} ---\n`);
      process.stdout.write(text);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
