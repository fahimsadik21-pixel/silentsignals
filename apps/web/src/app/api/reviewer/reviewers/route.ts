import { getDatabase } from "@/server/database";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const reviewer = await getReviewerIdentity(request);
    if (!reviewer) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (reviewer.role !== "reviewer" || !reviewer.teamId) {
      return jsonResponse({ data: [] });
    }
    const sql = getDatabase();
    const rows = await sql`
      SELECT u.id, u.public_id, u.role, u.route_scope, m.member_role
      FROM reviewer_team_members m
      JOIN reviewer_users u ON u.id = m.reviewer_id
      WHERE m.team_id = ${reviewer.teamId} AND m.is_active = true AND u.is_active = true
      ORDER BY CASE WHEN m.member_role = 'lead' THEN 0 ELSE 1 END, u.public_id ASC
    `;
    return jsonResponse({
      data: rows.map((row) => ({
        id: String(row.id),
        displayName: String(row.public_id),
        publicId: String(row.public_id),
        role: String(row.role),
        routeScope: String(row.route_scope),
        teamRole: String(row.member_role),
      })),
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
