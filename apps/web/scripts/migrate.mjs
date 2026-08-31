import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Add it to apps/web/.env.local first.");
}

const sql = neon(connectionString);
const migrationDirectory = path.resolve("migrations");

await sql.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const files = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of files) {
  const applied = await sql`
    SELECT 1 FROM schema_migrations WHERE name = ${file} LIMIT 1
  `;

  if (applied.length > 0) {
    process.stdout.write(`Already applied: ${file}\n`);
    continue;
  }

  const source = await readFile(path.join(migrationDirectory, file), "utf8");
  const statements = source
    .split("-- statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.transaction((transaction) => [
    ...statements.map((statement) => transaction.query(statement)),
    transaction`INSERT INTO schema_migrations (name) VALUES (${file})`,
  ]);

  process.stdout.write(`Applied: ${file}\n`);
}
