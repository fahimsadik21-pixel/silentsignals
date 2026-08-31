import { registerReviewer } from "@/server/governance-service";
import { isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { reviewerRegistrationSchema } from "@/server/report-schema";
import { isSameOriginMutation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  if (isRequestTooLarge(request, 8 * 1024)) return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  try {
    const parsed = reviewerRegistrationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse({ error: { code: "INVALID_REGISTRATION", message: "Use a valid email, invite code, and a 14-character password." } }, 422);
    }
    return jsonResponse({ data: await registerReviewer(parsed.data) }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_INVITE") return jsonResponse({ error: { code, message: "This team invite is invalid, expired, or already used." } }, 422);
    if (code === "ACCOUNT_EXISTS") return jsonResponse({ error: { code, message: "An account already exists for this email." } }, 409);
    return serviceErrorResponse(error);
  }
}
