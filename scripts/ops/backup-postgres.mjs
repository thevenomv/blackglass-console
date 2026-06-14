#!/usr/bin/env node
/**
 * backup-postgres.mjs
 *
 * Dumps the Blackglass Postgres database via pg_dump, compresses the output
 * with gzip, writes it locally, and optionally uploads it to DigitalOcean
 * Spaces (S3-compatible).
 *
 * Referenced by:
 *   docs/runbooks/operations.md §3 – weekly pg_dump to Spaces
 *   scripts/do/mothball-databases.ps1 – pre-destroy portable backup
 *   npm run db:backup
 *
 * Requirements:
 *   pg_dump on PATH (postgres-client-16 package, or libpq via brew).
 *   DATABASE_URL or individual PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE vars.
 *   DO_SPACES_* env vars for Spaces upload (omit or use --local-only to skip).
 *
 * Usage:
 *   node scripts/ops/backup-postgres.mjs
 *   node scripts/ops/backup-postgres.mjs --env staging
 *   node scripts/ops/backup-postgres.mjs --local-only
 *   node scripts/ops/backup-postgres.mjs --output-dir /tmp/backup
 *   node scripts/ops/backup-postgres.mjs --dry-run
 *
 * Env vars:
 *   DATABASE_URL            postgresql://... (preferred)
 *   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE (fallback)
 *   BACKUP_ENV              production | staging | dev  (default: production)
 *   BACKUP_SPACES_BUCKET    overrides DO_SPACES_BUCKET for backup destination
 *   BACKUP_SPACES_PREFIX    path prefix inside bucket (default: backups/postgres)
 *   DO_SPACES_ENDPOINT      e.g. https://lon1.digitaloceanspaces.com
 *   DO_SPACES_BUCKET        target Spaces bucket
 *   DO_SPACES_KEY           Spaces access key ID
 *   DO_SPACES_SECRET        Spaces secret access key
 */

import { spawn, execFile } from "node:child_process";
import { createGzip } from "node:zlib";
import { createWriteStream, createReadStream, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const LOCAL_ONLY  = args.includes("--local-only");

function flagValue(flag) {
  const eqForm = args.find((a) => a.startsWith(`${flag}=`));
  if (eqForm) return eqForm.split("=").slice(1).join("=");
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  return undefined;
}

const envFlag    = flagValue("--env");
const outDirFlag = flagValue("--output-dir");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function e(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

const BACKUP_ENV      = envFlag ?? e("BACKUP_ENV", "production");
const OUTPUT_DIR      = resolve(outDirFlag ?? e("BACKUP_OUTPUT_DIR", "./backups"));
const SPACES_ENDPOINT = e("DO_SPACES_ENDPOINT");
const SPACES_BUCKET   = e("BACKUP_SPACES_BUCKET") || e("DO_SPACES_BUCKET");
const SPACES_PREFIX   = e("BACKUP_SPACES_PREFIX", "backups/postgres");
const SPACES_KEY      = e("DO_SPACES_KEY");
const SPACES_SECRET   = e("DO_SPACES_SECRET");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function isoTag() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
}

/** Build pg_dump CLI args and password from DATABASE_URL or PG* env vars. */
function pgDumpConfig() {
  const url = e("DATABASE_URL");
  if (url) {
    const u = new URL(url);
    return {
      pgArgs: [
        "--format=plain",
        "--no-owner",
        "--no-acl",
        "--verbose",
        `--host=${u.hostname}`,
        `--port=${u.port || "5432"}`,
        `--username=${decodeURIComponent(u.username)}`,
        `--dbname=${u.pathname.replace(/^\//, "")}`,
      ],
      password: u.password ? decodeURIComponent(u.password) : "",
      sslmode: u.searchParams.get("sslmode") ?? e("PGSSLMODE", "require"),
    };
  }
  return {
    pgArgs: [
      "--format=plain",
      "--no-owner",
      "--no-acl",
      "--verbose",
      ...(process.env.PGHOST     ? [`--host=${process.env.PGHOST}`]     : []),
      ...(process.env.PGPORT     ? [`--port=${process.env.PGPORT}`]     : []),
      ...(process.env.PGUSER     ? [`--username=${process.env.PGUSER}`] : []),
      ...(process.env.PGDATABASE ? [`--dbname=${process.env.PGDATABASE}`] : []),
    ],
    password: e("PGPASSWORD"),
    sslmode: e("PGSSLMODE", "require"),
  };
}

// ---------------------------------------------------------------------------
// Dump → gzip → local file
// ---------------------------------------------------------------------------
async function runDump(localPath) {
  const { pgArgs, password, sslmode } = pgDumpConfig();

  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", pgArgs, {
      env: { ...process.env, PGPASSWORD: password, PGSSLMODE: sslmode },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const gzip = createGzip({ level: 9 });
    const out  = createWriteStream(localPath);

    child.stdout.pipe(gzip).pipe(out);

    child.stderr.on("data", (d) => process.stderr.write(d)); // pg_dump --verbose writes progress here

    out.on("finish", resolve);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`pg_dump exited with code ${code}`));
    });
    gzip.on("error", reject);
    out.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Spaces upload
// ---------------------------------------------------------------------------
async function uploadToSpaces(localPath, spacesKey) {
  if (!SPACES_ENDPOINT) throw new Error("DO_SPACES_ENDPOINT is not set.");
  if (!SPACES_BUCKET)   throw new Error("DO_SPACES_BUCKET (or BACKUP_SPACES_BUCKET) is not set.");
  if (!SPACES_KEY)      throw new Error("DO_SPACES_KEY is not set.");
  if (!SPACES_SECRET)   throw new Error("DO_SPACES_SECRET is not set.");

  const client = new S3Client({
    endpoint: SPACES_ENDPOINT,
    region: "us-east-1", // DO Spaces requires this placeholder
    credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
    forcePathStyle: false,
  });

  await client.send(new HeadBucketCommand({ Bucket: SPACES_BUCKET }));

  const upload = new Upload({
    client,
    params: {
      Bucket: SPACES_BUCKET,
      Key: spacesKey,
      Body: createReadStream(localPath),
      ContentType: "application/gzip",
      ACL: "private",
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
  });

  upload.on("httpUploadProgress", (p) => {
    if (p.loaded && p.total) {
      process.stdout.write(`\r  Uploading … ${fmtBytes(p.loaded)} / ${fmtBytes(p.total)}   `);
    }
  });

  await upload.done();
  process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n==> Blackglass Postgres backup`);
  console.log(`    env       : ${BACKUP_ENV}`);
  console.log(`    outputDir : ${OUTPUT_DIR}`);
  console.log(`    localOnly : ${LOCAL_ONLY}`);
  console.log(`    dryRun    : ${DRY_RUN}\n`);

  // Validate connection config
  if (!e("DATABASE_URL") && !process.env.PGHOST) {
    console.error("[backup] ERROR: Set DATABASE_URL or PGHOST/PGDATABASE env vars.");
    process.exit(1);
  }

  // Detect pg_dump
  try {
    const { stdout } = await execFileAsync("pg_dump", ["--version"]);
    console.log(`    pg_dump   : ${stdout.trim()}`);
  } catch {
    console.error("[backup] ERROR: pg_dump not found on PATH.");
    console.error("  Ubuntu/Debian : sudo apt-get install postgresql-client-16");
    console.error("  macOS         : brew install libpq && brew link --force libpq");
    console.error("  Windows (WSL) : run inside a WSL shell with pg-client installed");
    process.exit(1);
  }

  const timestamp = isoTag();
  const filename  = `blackglass-${BACKUP_ENV}-${timestamp}.sql.gz`;
  const localPath = join(OUTPUT_DIR, filename);
  const spacesKey = `${SPACES_PREFIX}/${BACKUP_ENV}/${filename}`;

  if (DRY_RUN) {
    console.log(`[dry-run] Would write : ${localPath}`);
    if (!LOCAL_ONLY) console.log(`[dry-run] Would upload: ${SPACES_ENDPOINT}/${SPACES_BUCKET}/${spacesKey}`);
    process.exit(0);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`==> Running pg_dump …`);
  await runDump(localPath);

  const { size } = statSync(localPath);
  console.log(`\n==> Dump written: ${localPath} (${fmtBytes(size)})`);

  if (size < 1024) {
    console.error("[backup] ERROR: Dump file is < 1 KB — something went wrong. Aborting.");
    process.exit(1);
  }

  if (!LOCAL_ONLY) {
    console.log(`\n==> Uploading to Spaces …`);
    console.log(`    bucket    : ${SPACES_BUCKET}`);
    console.log(`    key       : ${spacesKey}`);
    await uploadToSpaces(localPath, spacesKey);
  }

  console.log(`\n==> Backup complete.`);
  console.log(`    local     : ${localPath}`);
  if (!LOCAL_ONLY) console.log(`    spaces    : ${spacesKey}`);
  console.log(`    size      : ${fmtBytes(size)}`);
  console.log();

  // Structured summary for scripting callers (mothball script reads this)
  process.stdout.write(
    JSON.stringify({
      ok: true,
      env: BACKUP_ENV,
      localPath,
      spacesKey: LOCAL_ONLY ? null : spacesKey,
      sizeBytes: size,
      timestamp,
    }) + "\n",
  );
}

main().catch((err) => {
  console.error("[backup] FATAL:", err.message ?? err);
  process.exit(1);
});
