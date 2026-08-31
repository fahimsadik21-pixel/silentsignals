import { getDatabase } from "@/server/database";

export async function isRateLimited(
  scopeHash: string,
  eventType: string,
  maximum: number,
  windowMinutes: number,
) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT count(*)::int AS count
    FROM security_events
    WHERE scope_hash = ${scopeHash}
      AND event_type = ${eventType}
      AND created_at > now() - (${windowMinutes} * interval '1 minute')
  `;
  return Number(rows[0]?.count ?? 0) >= maximum;
}

export async function recordSecurityEvent(
  scopeHash: string,
  eventType: string,
  succeeded = true,
) {
  const sql = getDatabase();
  await sql`
    INSERT INTO security_events (scope_hash, event_type, succeeded)
    VALUES (${scopeHash}, ${eventType}, ${succeeded})
  `;
}
