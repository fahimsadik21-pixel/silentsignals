import { registerInitialAdministrator } from "@/server/governance-service";
import { getClientAddress, isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { isRateLimited, recordSecurityEvent } from "@/server/rate-limit";
import { governanceRegistrationSchema } from "@/server/report-schema";
import { createSecurityScope } from "@/server/security";
import { createReviewerSession, isSameOriginMutation } from "@/server/sessions";

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
    const parsed = governanceRegistrationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "INVALID_REGISTRATION",
            message: "Use a valid official email and a password with at least 14 characters.",
          },
        },
        422,
      );
    }

    const scope = createSecurityScope(
      "governance-bootstrap",
      parsed.data.email,
      getClientAddress(request),
    );
    if (await isRateLimited(scope, "governance_bootstrap", 5, 60)) {
      return jsonResponse(
        { error: { code: "TOO_MANY_ATTEMPTS", message: "Wait before trying again." } },
        429,
      );
    }

    const administrator = await registerInitialAdministrator(parsed.data);
    const response = jsonResponse(
      { data: { authenticated: true, publicId: administrator.publicId } },
      201,
    );
    await createReviewerSession(administrator.id, response);
    await recordSecurityEvent(scope, "governance_bootstrap");
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "GOVERNANCE_ALREADY_INITIALIZED") {
      return jsonResponse(
        {
          error: {
            code,
            message: "Governance is already initialized. Sign in with an existing Dean/VC account.",
          },
        },
        409,
      );
    }
    if (code.includes("reviewer_users_email_unique_idx")) {
      return jsonResponse(
        { error: { code: "ACCOUNT_EXISTS", message: "An account already exists for this email." } },
        409,
      );
    }
    return serviceErrorResponse(error);
  }
}
