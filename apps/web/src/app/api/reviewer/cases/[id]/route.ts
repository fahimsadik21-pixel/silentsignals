import { randomUUID } from "node:crypto";
import {
  getCaseSnapshot,
  reviewerCanAccessReport,
  writeAudit,
} from "@/server/case-service";
import { getDatabase } from "@/server/database";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { reviewerCaseUpdateSchema } from "@/server/report-schema";
import { encryptPayload } from "@/server/security";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatusTransitions: Record<string, string[]> = {
  received: ["triage", "closed"],
  triage: ["under_review", "awaiting_reporter", "closed"],
  under_review: ["awaiting_reporter", "resolved", "closed"],
  awaiting_reporter: ["under_review", "resolved", "closed"],
  resolved: ["under_review", "closed"],
  closed: [],
};

export async function GET(request: Request, context: RouteContext<"/api/reviewer/cases/[id]">) {
  try {
    const reviewer = await getReviewerIdentity(request);
    const { id } = await context.params;
    if (!reviewer) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (!(await reviewerCanAccessReport(reviewer, id))) {
      return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);
    }

    const snapshot = await getCaseSnapshot(id);
    if (!snapshot) return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);
    await writeAudit(reviewer.id, id, "case_viewed");
    return jsonResponse({ data: snapshot });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/reviewer/cases/[id]">) {
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  }
  if (isRequestTooLarge(request, 8 * 1024)) {
    return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  }

  try {
    const reviewer = await getReviewerIdentity(request);
    const { id } = await context.params;
    if (!reviewer) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (!(await reviewerCanAccessReport(reviewer, id))) {
      return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);
    }

    const parsed = reviewerCaseUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        { error: { code: "INVALID_UPDATE", message: "Review the case update and try again." } },
        422,
      );
    }
    const sql = getDatabase();
    const currentRows = await sql`
      SELECT status, priority, assigned_reviewer_id, route_type
      FROM reports WHERE id = ${id} LIMIT 1
    `;
    const current = currentRows[0];
    if (!current) return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);

    const nextStatus = parsed.data.status ?? String(current.status);
    const nextPriority = parsed.data.priority ?? Number(current.priority);
    const nextAssignee =
      parsed.data.assignedReviewerId === undefined
        ? (current.assigned_reviewer_id as string | null)
        : parsed.data.assignedReviewerId;
    if (
      nextStatus !== String(current.status) &&
      reviewer.role !== "administrator" &&
      !allowedStatusTransitions[String(current.status)]?.includes(nextStatus)
    ) {
      return jsonResponse(
        { error: { code: "INVALID_TRANSITION", message: "This status change is not allowed." } },
        422,
      );
    }
    if (nextAssignee) {
      const assigneeRows = await sql`
        SELECT id, role, route_scope
        FROM reviewer_users
        WHERE id = ${nextAssignee} AND is_active = true
          AND (
            role = 'administrator' OR route_scope = 'all' OR route_scope = ${String(current.route_type)}
          )
        LIMIT 1
      `;
      if (!assigneeRows[0]) {
        return jsonResponse({ error: { code: "INVALID_ASSIGNEE" } }, 422);
      }
    }

    const detail = parsed.data.note ? encryptPayload(parsed.data.note) : null;
    const eventId = randomUUID();
    await sql.transaction((transaction) => [
      transaction`
        UPDATE reports
        SET status = ${nextStatus}, priority = ${nextPriority},
          assigned_reviewer_id = ${nextAssignee}, updated_at = now(),
          resolved_at = CASE
            WHEN ${nextStatus} IN ('resolved', 'closed') THEN COALESCE(resolved_at, now())
            ELSE NULL
          END
        WHERE id = ${id}
      `,
      transaction`
        INSERT INTO case_events (
          id, report_id, event_type, public_status, actor_type, actor_reviewer_id,
          detail_ciphertext, detail_iv, detail_tag, encryption_version
        ) VALUES (
          ${eventId}, ${id}, 'case_updated', ${nextStatus}, 'reviewer', ${reviewer.id},
          ${detail?.ciphertext ?? null}, ${detail?.iv ?? null}, ${detail?.tag ?? null},
          ${detail?.version ?? 1}
        )
      `,
    ]);
    await writeAudit(reviewer.id, id, "case_updated");
    return jsonResponse({ data: await getCaseSnapshot(id) });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
