import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log('Connected to:', client.host);
const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log('Tables:', tables.rows.map(r => r.tablename).join(', ') || '(none)');
const drizzle = await client.query("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at").catch(() => ({ rows: [] }));
console.log('Drizzle migrations applied:', drizzle.rows.length);
drizzle.rows.forEach(r => console.log(' -', r.hash?.slice(0,20), r.created_at));

// Check _migrations (old migration tool)
const oldMig = await client.query("SELECT * FROM _migrations ORDER BY id").catch(() => ({ rows: [] }));
console.log('Old _migrations rows:', oldMig.rows.length);
oldMig.rows.forEach(r => console.log(' -', JSON.stringify(r)));

// Check if drift_events is partitioned
const partInfo = await client.query("SELECT relname, relkind FROM pg_class WHERE relname LIKE 'blackglass_drift_events%' ORDER BY relname");
console.log('drift_events partitioning:', partInfo.rows.map(r => `${r.relname}(${r.relkind})`).join(', '));
// relkind: 'r'=regular, 'p'=partitioned

await client.end();
