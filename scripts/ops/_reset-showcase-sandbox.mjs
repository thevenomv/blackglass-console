// Mark any showcase sandbox rows in error state as destroyed so a fresh
// provision attempt can run (route filters status='destroyed' out of the
// active-sandbox query). Idempotent.
import pg from "pg";
const { Client } = pg;
const c = new Client({ ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const tid = "5ade1010-0000-4000-8000-000000000001";
  const before = await c.query(
    "SELECT id, status, droplet_id, error_message, created_at FROM saas_sandboxes WHERE tenant_id = $1 ORDER BY created_at DESC",
    [tid],
  );
  console.log(`Before: ${before.rowCount} sandbox rows`);
  for (const r of before.rows) console.log(" ", r);

  const u = await c.query(
    `UPDATE saas_sandboxes SET status='destroyed', updated_at=NOW()
     WHERE tenant_id=$1 AND status NOT IN ('destroyed','ready','seeding')
     RETURNING id, status`,
    [tid],
  );
  console.log(`\nMarked destroyed: ${u.rowCount}`);
  for (const r of u.rows) console.log(" ", r);
} finally {
  await c.end();
}
