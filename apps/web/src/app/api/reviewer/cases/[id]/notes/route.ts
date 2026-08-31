import {
  addCaseInternalNote,
  getCaseInternalNotes,
  reviewerCanAccessReport,
  writeAudit,
} from "@/server/case-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { internalNoteSchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(request)) return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 8 * 1024)) return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    const { id } = await context.params;
    if (!identity || identity.role !== "reviewer" || !identity.teamId) {
      return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    }
    if (!(await reviewerCanAccessReport(identity, id))) {
      return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);
    }
    const parsed = internalNoteSchema.safeParse(await request.json());
    if (!parsed.success) return jsonResponse({ error: { code: "INVALID_NOTE" } }, 422);
    await addCaseInternalNote(id, identity.teamId, identity.id, parsed.data.body);
    await writeAudit(identity.id, id, "internal_note_added");
    return jsonResponse({ data: await getCaseInternalNotes(id, identity.teamId) }, 201);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
