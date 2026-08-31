import { getDatabase } from "@/server/database";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { reviewerAvailabilitySchema } from "@/server/report-schema";
import { getReviewerIdentity, isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 2 * 1024)) return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const identity = await getReviewerIdentity(request);
    if (!identity || identity.role !== "reviewer") return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    const parsed = reviewerAvailabilitySchema.safeParse(await request.json());
    if (!parsed.success) return jsonResponse({ error: { code: "INVALID_AVAILABILITY" } }, 422);
    const sql = getDatabase();
    await sql`UPDATE reviewer_users SET availability = ${parsed.data.availability}, updated_at = now() WHERE id = ${identity.id}`;
    return jsonResponse({ data: { availability: parsed.data.availability } });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
