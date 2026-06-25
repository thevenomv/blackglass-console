#!/usr/bin/env node
/**
 * List DigitalOcean resources likely tied to Blackglass.
 *
 * Prerequisites:
 *   export DIGITALOCEAN_ACCESS_TOKEN="dop_v1_..."   # or DO_API_TOKEN
 *
 * Usage:
 *   node scripts/do/inventory-do-resources.mjs
 *   node scripts/do/inventory-do-resources.mjs --json > do-inventory.json
 *
 * Run before mothballing and store the JSON offline with your runbook.
 */
import process from "node:process";

const TOKEN = (process.env.DIGITALOCEAN_ACCESS_TOKEN ?? process.env.DO_API_TOKEN ?? "").trim();
const JSON_OUT = process.argv.includes("--json");
const PROJECT_ID =
  process.env.BLACKGLASS_DO_PROJECT_ID?.trim() ?? "2081c029-849a-4286-8b19-27717a597258";

const NAME_HINTS = [
  "blackglass",
  "rustdesk-server",
  "blackglass-rustdesk-demo",
  "blackglass-lab",
  "blackglass-sandbox",
];

/** Droplets excluded from Blackglass mothball scope (still may appear if tagged). */
const DROPLET_EXCLUDE_NAMES = new Set(["obsidian-github-runner", "rustdesk-server"]);

function matchesHint(value) {
  const s = String(value ?? "").toLowerCase();
  return NAME_HINTS.some((h) => s.includes(h));
}

async function doFetch(path) {
  const res = await fetch(`https://api.digitalocean.com/v2${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

async function paginate(path, key) {
  const items = [];
  let page = 1;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await doFetch(`${path}${sep}page=${page}&per_page=200`);
    items.push(...(data[key] ?? []));
    if (!data.links?.pages?.next) break;
    page += 1;
  }
  return items;
}

function summarizeApp(a) {
  const components = [];
  for (const kind of ["services", "workers", "jobs"]) {
    for (const c of a.spec?.[kind] ?? []) {
      components.push({ kind, name: c.name, instance_count: c.instance_count ?? 1 });
    }
  }
  const latestCause = a.active_deployment?.cause ?? "";
  const archived = Boolean(a.spec?.maintenance?.archive) || /archived/i.test(latestCause);
  return {
    id: a.id,
    name: a.spec?.name,
    region: a.spec?.region,
    live_url: a.live_url,
    default_ingress: a.default_ingress,
    custom_domains: (a.spec?.domains ?? []).map((d) => d.domain),
    components,
    updated_at: a.updated_at,
    likely_archived: archived,
    active_deployment_cause: latestCause || undefined,
  };
}

function summarizeDroplet(d) {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    region: d.region?.slug,
    ip: d.networks?.v4?.find((n) => n.type === "public")?.ip_address,
    tags: d.tags,
    created_at: d.created_at,
  };
}

function summarizeDatabase(db) {
  return {
    id: db.id,
    name: db.name,
    engine: db.engine,
    version: db.version,
    region: db.region,
    status: db.status,
    num_nodes: db.num_nodes,
    size: db.size,
    tags: db.tags,
  };
}

async function main() {
  if (!TOKEN) {
    console.error("Set DIGITALOCEAN_ACCESS_TOKEN or DO_API_TOKEN.");
    process.exit(2);
  }

  const report = {
    generated_at: new Date().toISOString(),
    project_id_hint: PROJECT_ID,
    committed_ids: {
      postgres_cluster_ci: "4d063be8-1cc1-4b45-8b57-2a96a9c77161",
      do_project_default: PROJECT_ID,
      example_droplet_wait_script: "568513243",
    },
    apps: [],
    droplets: [],
    databases: [],
    volumes: [],
    firewalls: [],
    ssh_keys: [],
    project_resources: [],
    excluded_droplets: [],
    domains: [],
    notes: [],
  };

  const apps = await paginate("/apps", "apps");
  report.apps = apps.filter((a) => matchesHint(a.spec?.name) || matchesHint(a.live_url)).map(summarizeApp);

  const droplets = await paginate("/droplets", "droplets");
  report.droplets = droplets
    .filter(
      (d) =>
        !DROPLET_EXCLUDE_NAMES.has(d.name) &&
        (matchesHint(d.name) || (d.tags ?? []).some(matchesHint)),
    )
    .map(summarizeDroplet);

  report.excluded_droplets = droplets
    .filter((d) => DROPLET_EXCLUDE_NAMES.has(d.name))
    .map((d) => ({ ...summarizeDroplet(d), note: "Not Blackglass — do not mothball" }));

  const databases = await paginate("/databases", "databases");
  report.databases = databases
    .filter((d) => matchesHint(d.name) || (d.tags ?? []).some(matchesHint))
    .map(summarizeDatabase);

  const volumes = await paginate("/volumes", "volumes");
  report.volumes = volumes
    .filter((v) => matchesHint(v.name) || (v.tags ?? []).some(matchesHint))
    .map((v) => ({
      id: v.id,
      name: v.name,
      region: v.region?.slug,
      size_gigabytes: v.size_gigabytes,
      droplet_ids: v.droplet_ids,
    }));

  const firewalls = await paginate("/firewalls", "firewalls");
  report.firewalls = firewalls
    .filter((f) => matchesHint(f.name) || (f.tags ?? []).some(matchesHint))
    .map((f) => ({ id: f.id, name: f.name, status: f.status, droplet_ids: f.droplet_ids }));

  const keys = await paginate("/account/keys", "ssh_keys");
  report.ssh_keys = keys
    .filter((k) => matchesHint(k.name))
    .map((k) => ({ id: k.id, name: k.name, fingerprint: k.fingerprint }));

  try {
    const proj = await doFetch(`/projects/${PROJECT_ID}/resources`);
    report.project_resources = (proj.resources ?? []).map((r) => ({
      urn: r.urn,
      assigned_at: r.assigned_at,
    }));
  } catch (e) {
    report.notes.push(`Could not list project ${PROJECT_ID}: ${e.message}`);
  }

  const domains = await paginate("/domains", "domains");
  report.domains = domains
    .filter((d) => matchesHint(d.name))
    .map((d) => ({ name: d.name, ttl: d.ttl }));

  report.notes.push(
    "Spaces buckets are not listed by this script — record DO_SPACES_BUCKET from Doppler/1Password.",
  );
  report.notes.push(
    "DO Domains zones may coexist with Cloudflare — export both before mothballing.",
  );
  report.notes.push(
    "Committed App Platform spec may omit ops-worker/sandbox-worker; compare live spec via: doctl apps spec get <app-id>",
  );
  report.notes.push("If likely_archived is true, unarchive the app in DO console before reactivation.");

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("# Blackglass DigitalOcean inventory");
  console.log(`Generated: ${report.generated_at}\n`);

  const sections = [
    ["App Platform apps", report.apps],
    ["Droplets", report.droplets],
    ["Managed databases (Postgres / Valkey)", report.databases],
    ["Block volumes", report.volumes],
    ["Cloud firewalls", report.firewalls],
    ["Account SSH keys", report.ssh_keys],
    ["DO Domains (zones)", report.domains],
  ];

  for (const [title, items] of sections) {
    console.log(`## ${title} (${items.length})`);
    if (items.length === 0) {
      console.log("  (none matched name/tag hints)\n");
      continue;
    }
    for (const item of items) {
      console.log(JSON.stringify(item, null, 2));
      console.log("");
    }
  }

  console.log(`## DO Project resources (${report.project_resources.length})`);
  console.log(`Project ID hint: ${PROJECT_ID}`);
  for (const r of report.project_resources) {
    console.log(`  ${r.urn}`);
  }

  if (report.excluded_droplets?.length) {
    console.log(`\n## Excluded from Blackglass scope (${report.excluded_droplets.length})`);
    for (const item of report.excluded_droplets) {
      console.log(JSON.stringify(item, null, 2));
      console.log("");
    }
  }

  console.log("\n## Notes");
  for (const n of report.notes) console.log(`- ${n}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
