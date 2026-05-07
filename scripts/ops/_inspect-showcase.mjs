import pg from "pg";
const { Client } = pg;
const c = new Client({ ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const tid = "5ade1010-0000-4000-8000-000000000001";

  const cols = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'saas_sandboxes' ORDER BY ordinal_position",
  );
  console.log("saas_sandboxes columns:", cols.rows.map((r) => r.column_name).join(", "));

  const s = await c.query(
    `SELECT * FROM saas_sandboxes WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tid],
  );
  console.log(`\nSandboxes (${s.rows.length}):`);
  for (const sx of s.rows) {
    console.log("-".repeat(72));
    for (const [k, v] of Object.entries(sx)) console.log(`  ${k.padEnd(20)} ${v}`);
  }

  const h = await c.query(
    "SELECT id, hostname, label, ssh_user, ssh_port, created_at FROM saas_collector_hosts WHERE tenant_id = $1",
    [tid],
  );
  console.log(`\nCollector hosts (${h.rows.length}):`);
  for (const r of h.rows) console.log(" ", r);

  const auditCols = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'saas_audit_events' ORDER BY ordinal_position",
  );
  console.log("\naudit columns:", auditCols.rows.map((r) => r.column_name).join(", "));
  const a = await c.query(
    `SELECT * FROM saas_audit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 8`,
    [tid],
  );
  console.log(`\nRecent audit events (${a.rows.length}):`);
  for (const r of a.rows) console.log(" ", r);
} finally {
  await c.end();
}
