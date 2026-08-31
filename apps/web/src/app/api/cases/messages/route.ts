import { addCaseMessage, getCaseSnapshot } from "@/server/case-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { messageInputSchema } from "@/server/report-schema";
import { getReporterReportId, isSameOriginMutation } from "@/server/sessions";
import { createSecurityScope } from "@/server/security";
import { isRateLimited, recordSecurityEvent } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: { code: "INVALID_ORIGIN", message: "Request rejected." } }, 403);
  }
  if (isRequestTooLarge(request, 8 * 1024)) {
    return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  }

  try {
    const reportId = await getReporterReportId(request);
    if (!reportId) {
      return jsonResponse(
        { error: { code: "CASE_SESSION_REQUIRED", message: "Open the case again to reply." } },
        401,
      );
    }
    const messageScope = createSecurityScope("reporter-message", reportId);
    if (await isRateLimited(messageScope, "reporter_message", 30, 15)) {
      return jsonResponse(
        { error: { code: "MESSAGE_LIMIT", message: "Wait before sending another message." } },
        429,
      );
    }
    const parsed = messageInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        { error: { code: "INVALID_MESSAGE", message: "Write a message before sending." } },
        422,
      );
    }

    await addCaseMessage(reportId, "reporter", parsed.data.body);
    await recordSecurityEvent(messageScope, "reporter_message");
    const snapshot = await getCaseSnapshot(reportId);
    return jsonResponse({ data: snapshot }, 201);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
