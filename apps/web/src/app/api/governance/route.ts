import { getGovernanceSnapshot } from "@/server/governance-service";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (identity.role !== "administrator") {
      return jsonResponse({ error: { code: "GOVERNANCE_ACCESS_REQUIRED" } }, 403);
    }
    return jsonResponse({ data: await getGovernanceSnapshot(identity) });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
