import { randomUUID, scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import { neon } from "@neondatabase/serverless";

const scrypt = promisify(scryptCallback);
const argumentsMap = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.split("=");
    return [key, rest.join("=")];
  }),
);
const email = argumentsMap.get("--email")?.trim().toLowerCase();
const displayName = argumentsMap.get("--name")?.trim();
const role = argumentsMap.get("--role") ?? "reviewer";
const routeScope = argumentsMap.get("--scope") ?? "committee";
const password = process.env.SILENTSIGNALS_REVIEWER_PASSWORD;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!email || !displayName) {
  throw new Error(
    "Use --email=reviewer@example.edu --name=\"Reviewer Name\" and set SILENTSIGNALS_REVIEWER_PASSWORD.",
  );
}
if (!password || password.length < 14) {
  throw new Error("SILENTSIGNALS_REVIEWER_PASSWORD must contain at least 14 characters.");
}
if (!["reviewer", "administrator"].includes(role)) throw new Error("Invalid role.");
if (!["committee", "independent_oversight", "all"].includes(routeScope)) {
  throw new Error("Invalid route scope.");
}

const salt = randomBytes(16);
const key = await scrypt(password, salt, 64, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const passwordHash = [
  "scrypt",
  "v1",
  32768,
  8,
  1,
  salt.toString("base64url"),
  Buffer.from(key).toString("base64url"),
].join(":");
const sql = neon(connectionString);
const reviewerId = randomUUID();
const publicId = `${role === "administrator" ? "GOV" : "REV"}-${reviewerId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;

await sql`
  INSERT INTO reviewer_users (
    id, email, display_name, password_hash, role, route_scope,
    public_id, account_status, is_active, approved_at
  ) VALUES (
    ${reviewerId}, ${email}, ${role === "administrator" ? displayName : publicId},
    ${passwordHash}, ${role}, ${routeScope}, ${publicId}, 'active', true, now()
  )
  ON CONFLICT (lower(email)) DO UPDATE SET
    display_name = CASE
      WHEN EXCLUDED.role = 'administrator' THEN EXCLUDED.display_name
      ELSE reviewer_users.public_id
    END,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    route_scope = EXCLUDED.route_scope,
    is_active = true,
    account_status = 'active',
    approved_at = COALESCE(reviewer_users.approved_at, now()),
    updated_at = now()
`;

process.stdout.write(`Reviewer ready: ${email} (${role}, ${routeScope})\n`);
