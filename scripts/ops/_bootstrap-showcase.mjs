// One-shot: insert the public showcase tenant if missing, return its UUID.
// Designed to run from a dev machine with PG* env vars set; not committed to repo,
// kept under scripts/ops with a leading underscore so the .gitignore _* rule
// (or your eyes) skip it. Re-runnable; no destructive ops.
import pg from "pg";
const { Client } = pg;
const c = new Client({ ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const exists = await c.query("SELECT to_regclass('saas_tenants') AS t");
  if (!exists.rows[0].t) {
    console.error("ERROR: saas_tenants table not found. Migrations not applied?");
    process.exit(2);
  }
  const r = await c.query(
    `INSERT INTO saas_tenants (id, clerk_org_id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (clerk_org_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, clerk_org_id, name, created_at;`,
    [
      "5ade1010-0000-4000-8000-000000000001",
      "showcase-public-demo",
      "Northbridge Systems (Public Showcase)",
    ],
  );
  const row = r.rows[0];
  console.log(JSON.stringify({ ok: true, tenant: row }, null, 2));

  // Sanity: count any sandboxes the showcase tenant already owns.
  const s = await c.query(
    `SELECT id, status, region, seed_phase, droplet_id, created_at, ttl_expires_at
     FROM saas_sandboxes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5;`,
    [row.id],
  );
  console.log("Existing sandboxes for showcase tenant:", s.rows.length);
  for (const sx of s.rows) console.log(" ", sx);
} finally {
  await c.end();
}
