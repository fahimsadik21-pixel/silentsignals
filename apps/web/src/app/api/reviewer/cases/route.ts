import { decryptPayload, type EncryptedPayload } from "@/server/security";
import { getDatabase } from "@/server/database";
import { reviewerCanAccessRoute } from "@/server/case-service";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import type { ReportInput } from "@/server/report-schema";
import { getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaseListRow = {
  id: string;
  tracking_code: string;
  payload_ciphertext: string;
  payload_iv: string;
  payload_tag: string;
  encryption_version: number;
  status: string;
  route_type: string;
  urgency: string;
  priority: number;
  evidence_count: number;
  assigned_reviewer_id: string | null;
  assigned_reviewer_public_id: string | null;
  assigned_team_id: string | null;
  team_public_id: string | null;
  team_label: string | null;
  lead_reviewer_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const reviewer = await getReviewerIdentity(request);
    if (!reviewer) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (reviewer.role !== "reviewer") {
      return jsonResponse({ error: { code: "CASE_ACCESS_PROHIBITED" } }, 403);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() ?? "";
    const urgency = url.searchParams.get("urgency")?.trim() ?? "";
    const query = url.searchParams.get("query")?.trim().slice(0, 40) ?? "";
    const assignment = url.searchParams.get("assignment")?.trim() ?? "";
    const effectiveScope = reviewer.routeScope;
    const sql = getDatabase();
    const rows = await sql`
      SELECT
        r.id, r.tracking_code, r.payload_ciphertext, r.payload_iv, r.payload_tag,
        r.encryption_version, r.status, r.route_type, r.urgency, r.priority,
        r.evidence_count, r.assigned_reviewer_id, u.public_id AS assigned_reviewer_public_id,
        r.assigned_team_id, t.public_id AS team_public_id, t.label AS team_label,
        r.lead_reviewer_id,
        r.created_at, r.updated_at
      FROM reports r
      LEFT JOIN reviewer_users u ON u.id = r.assigned_reviewer_id
      LEFT JOIN reviewer_teams t ON t.id = r.assigned_team_id
      WHERE (
          (r.assigned_team_id IS NOT NULL AND r.assigned_team_id = ${reviewer.teamId}) OR
          (r.assigned_team_id IS NULL AND (${effectiveScope} = 'all' OR r.route_type = ${effectiveScope}))
        )
        AND (${status} = '' OR r.status = ${status})
        AND (${urgency} = '' OR r.urgency = ${urgency})
        AND (${query} = '' OR r.tracking_code ILIKE ${`%${query}%`})
        AND (
          ${assignment} = '' OR
          (${assignment} = 'mine' AND r.lead_reviewer_id = ${reviewer.id}) OR
          (${assignment} = 'unassigned' AND r.lead_reviewer_id IS NULL)
        )
      ORDER BY r.priority DESC, r.updated_at DESC
      LIMIT 100
    `;
    const cases = (rows as CaseListRow[])
      .filter((row) => reviewerCanAccessRoute(reviewer, row.route_type))
      .map((row) => {
        const payload = decryptPayload<ReportInput>({
          ciphertext: row.payload_ciphertext,
          iv: row.payload_iv,
          tag: row.payload_tag,
          version: row.encryption_version as EncryptedPayload["version"],
        });
        return {
          id: row.id,
          trackingCode: row.tracking_code,
          title: payload.title,
          category: payload.category,
          status: row.status,
          routeType: row.route_type,
          urgency: row.urgency,
          priority: Number(row.priority),
          evidenceCount: Number(row.evidence_count),
          assignedReviewerId: row.assigned_reviewer_id,
          assignedReviewerPublicId: row.assigned_reviewer_public_id,
          assignedReviewerName: row.assigned_reviewer_public_id,
          assignedTeamId: row.assigned_team_id,
          teamPublicId: row.team_public_id,
          teamLabel: row.team_label,
          canReply: row.lead_reviewer_id === reviewer.id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

    const metrics = {
      total: cases.length,
      urgent: cases.filter((item) => item.urgency !== "standard").length,
      unassigned: cases.filter((item) => !item.assignedReviewerId).length,
      awaitingReporter: cases.filter((item) => item.status === "awaiting_reporter").length,
    };
    return jsonResponse({ data: { cases, metrics, reviewer } });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
