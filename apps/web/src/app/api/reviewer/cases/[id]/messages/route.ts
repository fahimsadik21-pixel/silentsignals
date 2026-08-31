import {
  addCaseMessage,
  getCaseInternalNotes,
  getCaseSnapshot,
  reviewerCanAccessReport,
  reviewerCanReplyToReport,
  writeAudit,
} from "@/server/case-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { messageInputSchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/reviewer/cases/[id]/messages">,
) {
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
    if (!(await reviewerCanReplyToReport(reviewer, id))) {
      return jsonResponse(
        { error: { code: "LEAD_REQUIRED", message: "Only the assigned Lead Reviewer can reply to the reporter." } },
        403,
      );
    }
    const parsed = messageInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse({ error: { code: "INVALID_MESSAGE" } }, 422);
    }

    await addCaseMessage(id, "reviewer", parsed.data.body, reviewer.id);
    await writeAudit(reviewer.id, id, "message_sent");
    const snapshot = await getCaseSnapshot(id);
    const internalNotes = reviewer.teamId ? await getCaseInternalNotes(id, reviewer.teamId) : [];
    return jsonResponse({
      data: { ...snapshot, internalNotes, canReply: true, viewerTeamRole: reviewer.teamRole },
    }, 201);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
