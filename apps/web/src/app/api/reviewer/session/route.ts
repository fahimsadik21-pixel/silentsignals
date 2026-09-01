import { getDatabase } from "@/server/database";
import {
  getClientAddress,
  isRequestTooLarge,
  jsonResponse,
  serviceErrorResponse,
} from "@/server/http";
import { reviewerLoginSchema } from "@/server/report-schema";
import { createSecurityScope } from "@/server/security";
import {
  createReviewerSession,
  destroyReviewerSession,
  getReviewerIdentity,
  isSameOriginMutation,
} from "@/server/sessions";
import { writeAudit } from "@/server/case-service";
import { validateReviewerLogin } from "@/server/governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const reviewer = await getReviewerIdentity(request);
    return reviewer
      ? jsonResponse({ data: reviewer })
      : jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return jsonResponse(
      { error: { code: "INVALID_ORIGIN", message: "Request rejected." } },
      403,
    );
  }
  if (isRequestTooLarge(request, 8 * 1024)) {
    return jsonResponse({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
  }

  try {
    const parsed = reviewerLoginSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.privateKey) {
      return jsonResponse(
        {
          error: {
            code: "INVALID_LOGIN",
            message: "The email or private key is incorrect.",
          },
        },
        401,
      );
    }

    const sql = getDatabase();
    const scopeHash = createSecurityScope(
      "reviewer-login",
      parsed.data.email,
      getClientAddress(request),
    );
    const recent = await sql`
      SELECT count(*)::int AS count
      FROM security_events
      WHERE scope_hash = ${scopeHash}
        AND event_type = 'reviewer_login'
        AND succeeded = false
        AND created_at > now() - interval '15 minutes'
    `;
    if (Number(recent[0]?.count ?? 0) >= 10) {
      return jsonResponse(
        {
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: "Wait 15 minutes before trying again.",
          },
        },
        429,
      );
    }

    let reviewerId: string | null = null;
    try {
      const validReviewer = await validateReviewerLogin({
        email: parsed.data.email,
        privateKey: parsed.data.privateKey,
      });
      reviewerId = validReviewer.id;
    } catch {
      reviewerId = null;
    }

    const verified = Boolean(reviewerId);
    await sql`
      INSERT INTO security_events (scope_hash, event_type, succeeded)
      VALUES (${scopeHash}, 'reviewer_login', ${verified})
    `;
    if (!verified || !reviewerId) {
      return jsonResponse(
        {
          error: {
            code: "INVALID_LOGIN",
            message: "The email or private key is incorrect.",
          },
        },
        401,
      );
    }

    await sql`UPDATE reviewer_users SET last_login_at = now() WHERE id = ${reviewerId}`;
    const response = jsonResponse({ data: { authenticated: true } });
    await createReviewerSession(reviewerId, response);
    await writeAudit(reviewerId, null, "reviewer_login", scopeHash);
    return response;
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: { code: "INVALID_ORIGIN" } }, 403);
  }

  try {
    const reviewer = await getReviewerIdentity(request);
    const response = jsonResponse({ data: { authenticated: false } });
    await destroyReviewerSession(request, response);
    if (reviewer) await writeAudit(reviewer.id, null, "reviewer_logout");
    return response;
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
