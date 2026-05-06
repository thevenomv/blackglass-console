import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Check drizzle migrations table
const r1 = await client.query("SELECT to_regclass('__drizzle_migrations') as t");
console.log('__drizzle_migrations exists:', r1.rows[0].t);

// Read and apply the partition migration SQL
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve('drizzle/0003_drift_events_partition.sql'), 'utf8');
console.log('Applying drift_events partition migration...');
try {
  await client.query(sql);
  console.log('Migration applied successfully!');
} catch (e) {
  console.error('Migration error:', e.message);
}

// Check result
const r2 = await client.query("SELECT relname, relkind FROM pg_class WHERE relname LIKE 'drift_events%' ORDER BY relname");
console.log('drift_events tables after migration:');
r2.rows.forEach(r => console.log(' ', r.relname, r.relkind === 'p' ? '(partitioned)' : r.relkind === 'r' ? '(table)' : r.relkind));

await client.end();
