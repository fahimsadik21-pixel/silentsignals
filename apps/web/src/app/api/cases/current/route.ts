import { getCaseSnapshot } from "@/server/case-service";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReporterReportId } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const reportId = await getReporterReportId(request);
    if (!reportId) {
      return jsonResponse(
        { error: { code: "CASE_SESSION_REQUIRED", message: "Open the case again to continue." } },
        401,
      );
    }

    const snapshot = await getCaseSnapshot(reportId);
    if (!snapshot) return jsonResponse({ error: { code: "CASE_NOT_FOUND" } }, 404);

    return jsonResponse({ data: snapshot });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
