import pg from "pg";
import { readFileSync } from "fs";

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) { console.error("DATABASE_URL is required"); process.exit(1); }

const sql = readFileSync("./drizzle/0001_add_collector_hosts.sql", "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

// Strip sslmode param — DO managed Postgres uses self-signed CA;
// pass ssl options explicitly so pg doesn't reject the certificate.
const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

const client = new pg.Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to production DB");

for (const stmt of statements) {
  const preview = stmt.slice(0, 80).replace(/\n/g, " ");
  try {
    await client.query(stmt);
    console.log("OK  :", preview);
  } catch (e) {
    const msg = e.message ?? String(e);
    if (msg.includes("already exists")) {
      console.log("SKIP:", preview);
    } else {
      console.error("ERR :", msg);
      console.error("SQL :", stmt.slice(0, 200));
      await client.end();
      process.exit(1);
    }
  }
}

await client.end();
console.log("Migration 0001_add_collector_hosts complete.");
