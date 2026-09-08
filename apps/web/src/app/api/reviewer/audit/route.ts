import { reviewerCanAccessReport } from "@/server/case-service";
import { getDatabase } from "@/server/database";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  report_id: string | null;
  tracking_code: string | null;
  action: string;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const reviewer = await getReviewerIdentity(request);
    if (!reviewer || reviewer.role !== "reviewer") {
      return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    }

    const sql = getDatabase();
    const rows = (await sql`
      SELECT a.id::text, a.report_id::text, r.tracking_code, a.action, a.created_at::text
      FROM audit_log a
      LEFT JOIN reports r ON r.id = a.report_id
      WHERE a.reviewer_id = ${reviewer.id}
      ORDER BY a.created_at DESC
      LIMIT 40
    `) as AuditRow[];

    const filteredRows: Array<{
      id: string;
      trackingCode: string | null;
      action: string;
      createdAt: string;
    }> = [];
    for (const row of rows) {
      if (row.report_id && !(await reviewerCanAccessReport(reviewer, row.report_id))) continue;
      filteredRows.push({
        id: row.id,
        trackingCode: row.tracking_code,
        action: row.action,
        createdAt: row.created_at,
      });
    }

    return jsonResponse({ data: filteredRows });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
