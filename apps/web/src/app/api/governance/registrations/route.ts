import { decideRegistration } from "@/server/governance-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { governanceDecisionSchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 4 * 1024)) return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (identity.role !== "administrator") return jsonResponse({ error: { code: "GOVERNANCE_ACCESS_REQUIRED" } }, 403);
    const parsed = governanceDecisionSchema.safeParse(await request.json());
    if (!parsed.success) return jsonResponse({ error: { code: "INVALID_DECISION" } }, 422);
    return jsonResponse({ data: await decideRegistration(identity, parsed.data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "REQUEST_NOT_PENDING") return jsonResponse({ error: { code, message: "This request is no longer pending." } }, 409);
    if (code === "TEAM_FULL") return jsonResponse({ error: { code, message: "This five-person team is already full." } }, 409);
    return serviceErrorResponse(error);
  }
}
