import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.SILENTSIGNALS_DATABASE_POSTGRES_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  process.stdout.write("Database migration skipped: no database URL is configured.\n");
  process.exit(0);
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
