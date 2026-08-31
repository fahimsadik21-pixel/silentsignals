import { createReviewerTeam } from "@/server/governance-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { governanceTeamSchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 8 * 1024)) return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (identity.role !== "administrator") return jsonResponse({ error: { code: "GOVERNANCE_ACCESS_REQUIRED" } }, 403);
    const parsed = governanceTeamSchema.safeParse(await request.json());
    if (!parsed.success) return jsonResponse({ error: { code: "INVALID_TEAM", message: "Check the team details." } }, 422);
    return jsonResponse({ data: await createReviewerTeam(identity, parsed.data) }, 201);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
