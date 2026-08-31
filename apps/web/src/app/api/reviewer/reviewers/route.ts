import { getDatabase } from "@/server/database";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const reviewer = await getReviewerIdentity(request);
    if (!reviewer) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    const sql = getDatabase();
    const rows = await sql`
      SELECT id, display_name, role, route_scope
      FROM reviewer_users
      WHERE is_active = true
      ORDER BY display_name ASC
    `;
    return jsonResponse({
      data: rows.map((row) => ({
        id: String(row.id),
        displayName: String(row.display_name),
        role: String(row.role),
        routeScope: String(row.route_scope),
      })),
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
