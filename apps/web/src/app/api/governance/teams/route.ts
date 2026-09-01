import {
  createReviewerTeam,
  deleteUnusedTeam,
} from "@/server/governance-service";
import {
  isRequestTooLarge,
  jsonResponse,
  serviceErrorResponse,
} from "@/server/http";
import { governanceTeamSchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 8 * 1024))
    return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity)
      return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (identity.role !== "administrator")
      return jsonResponse(
        { error: { code: "GOVERNANCE_ACCESS_REQUIRED" } },
        403,
      );
    const parsed = governanceTeamSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonResponse(
        { error: { code: "INVALID_TEAM", message: "Check the team details." } },
        422,
      );
    return jsonResponse(
      { data: await createReviewerTeam(identity, parsed.data) },
      201,
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request))
    return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 4 * 1024))
    return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity)
      return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (identity.role !== "administrator")
      return jsonResponse(
        { error: { code: "GOVERNANCE_ACCESS_REQUIRED" } },
        403,
      );
    const body = await request.json();
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    if (!teamId)
      return jsonResponse(
        { error: { code: "INVALID_TEAM", message: "Team id is required." } },
        422,
      );
    return jsonResponse({ data: await deleteUnusedTeam(identity, teamId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "TEAM_NOT_FOUND")
      return jsonResponse({ error: { code, message: "Team not found." } }, 404);
    if (code === "TEAM_HAS_ACTIVE_REVIEWERS")
      return jsonResponse(
        { error: { code, message: "This team still has active reviewers." } },
        409,
      );
    return serviceErrorResponse(error);
  }
}
