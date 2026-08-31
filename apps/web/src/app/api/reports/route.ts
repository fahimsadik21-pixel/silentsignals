import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import { getClientAddress, isRequestTooLarge, jsonResponse, serviceErrorResponse } from "@/server/http";
import { reportInputSchema } from "@/server/report-schema";
import { createSecurityScope, encryptPayload, generateCaseCredentials, hashAccessKey } from "@/server/security";
import { createReporterSession } from "@/server/sessions";
import { isRateLimited, recordSecurityEvent } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function POST(request: Request) {
  if (isRequestTooLarge(request)) {
    return jsonResponse(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "The report payload is too large." } },
      413,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: { code: "INVALID_JSON", message: "A valid JSON body is required." } },
      400,
    );
  }

  const parsed = reportInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_REPORT",
          message: "Review the report fields and try again.",
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      422,
    );
  }

  try {
    const sql = getDatabase();
    const submissionScope = createSecurityScope("report-create", getClientAddress(request));
    if (await isRateLimited(submissionScope, "report_create", 10, 60)) {
      return jsonResponse(
        { error: { code: "TOO_MANY_REPORTS", message: "This connection has reached the temporary submission limit." } },
        429,
      );
    }
    const encryptedPayload = encryptPayload(parsed.data);
    const routeType =
      parsed.data.target === "leadership" || parsed.data.target === "vice_chancellor"
        ? "independent_oversight"
        : "committee";
    const priority = parsed.data.urgency === "immediate" ? 4 : parsed.data.urgency === "urgent" ? 3 : 2;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const credentials = generateCaseCredentials();
      const accessKeyHash = await hashAccessKey(credentials.accessKey);
      const reportId = randomUUID();
      const eventId = randomUUID();

      try {
        await sql.transaction((transaction) => [
          transaction`
            INSERT INTO reports (
              id,
              tracking_code,
              access_key_hash,
              payload_ciphertext,
              payload_iv,
              payload_tag,
              encryption_version,
              status,
              route_type,
              urgency,
              evidence_count,
              priority
            ) VALUES (
              ${reportId},
              ${credentials.trackingCode},
              ${accessKeyHash},
              ${encryptedPayload.ciphertext},
              ${encryptedPayload.iv},
              ${encryptedPayload.tag},
              ${encryptedPayload.version},
              'received',
              ${routeType},
              ${parsed.data.urgency},
              0,
              ${priority}
            )
          `,
          transaction`
            INSERT INTO case_events (id, report_id, event_type, public_status)
            VALUES (${eventId}, ${reportId}, 'report_received', 'received')
          `,
        ]);

        const response = jsonResponse(
          {
            data: {
              trackingCode: credentials.trackingCode,
              accessKey: credentials.accessKey,
              status: "received",
            },
          },
          201,
        );
        await createReporterSession(reportId, response);
        await recordSecurityEvent(submissionScope, "report_create");
        return response;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }

    throw new Error("Credential generation failed.");
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
