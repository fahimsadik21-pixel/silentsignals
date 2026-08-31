import { getDatabase } from "@/server/database";
import {
  getClientAddress,
  isRequestTooLarge,
  jsonResponse,
  serviceErrorResponse,
} from "@/server/http";
import { caseAccessSchema, type ReportInput } from "@/server/report-schema";
import {
  consumeInvalidCredentialWork,
  createAccessScope,
  decryptPayload,
  normalizeAccessKey,
  normalizeTrackingCode,
  verifyAccessKey,
  type EncryptedPayload,
} from "@/server/security";
import { createReporterSession } from "@/server/sessions";
import { getCaseSnapshot } from "@/server/case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRecord = {
  id: string;
  access_key_hash: string;
  payload_ciphertext: string;
  payload_iv: string;
  payload_tag: string;
  encryption_version: number;
  status: string;
  route_type: string;
  created_at: string;
  updated_at: string;
  evidence_count: number;
};

const trackingCodePattern = /^SIG-\d{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const accessKeyPattern = /^[A-HJ-NP-Z2-9]{16}$/;

export async function POST(request: Request) {
  if (isRequestTooLarge(request, 4 * 1024)) {
    return jsonResponse(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "The request is too large." } },
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

  const parsed = caseAccessSchema.safeParse(body);

  if (!parsed.success) {
    return jsonResponse(
      { error: { code: "INVALID_CREDENTIALS", message: "The case credentials are invalid." } },
      401,
    );
  }

  const trackingCode = normalizeTrackingCode(parsed.data.trackingCode);
  const accessKey = normalizeAccessKey(parsed.data.accessKey);

  if (!trackingCodePattern.test(trackingCode) || !accessKeyPattern.test(accessKey)) {
    return jsonResponse(
      { error: { code: "INVALID_CREDENTIALS", message: "The case credentials are invalid." } },
      401,
    );
  }

  try {
    const sql = getDatabase();
    const scopeHash = createAccessScope(trackingCode, getClientAddress(request));
    const recentAttempts = await sql`
      SELECT count(*)::int AS count
      FROM access_attempts
      WHERE scope_hash = ${scopeHash}
        AND succeeded = false
        AND created_at > now() - interval '15 minutes'
    `;
    const failureCount = Number(recentAttempts[0]?.count ?? 0);

    if (failureCount >= 10) {
      return jsonResponse(
        {
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many attempts. Wait 15 minutes before trying again.",
          },
        },
        429,
      );
    }

    const rows = await sql`
      SELECT
        id,
        access_key_hash,
        payload_ciphertext,
        payload_iv,
        payload_tag,
        encryption_version,
        status,
        route_type,
        created_at,
        updated_at
        ,evidence_count
      FROM reports
      WHERE tracking_code = ${trackingCode}
      LIMIT 1
    `;
    const report = rows[0] as ReportRecord | undefined;
    const verified = report
      ? await verifyAccessKey(accessKey, report.access_key_hash)
      : (await consumeInvalidCredentialWork(accessKey), false);

    await sql`
      INSERT INTO access_attempts (scope_hash, succeeded)
      VALUES (${scopeHash}, ${verified})
    `;

    if (!report || !verified) {
      return jsonResponse(
        { error: { code: "INVALID_CREDENTIALS", message: "The case credentials are invalid." } },
        401,
      );
    }

    const payload = decryptPayload<ReportInput>({
      ciphertext: report.payload_ciphertext,
      iv: report.payload_iv,
      tag: report.payload_tag,
      version: report.encryption_version as EncryptedPayload["version"],
    });

    await sql`
      UPDATE reports
      SET last_accessed_at = now()
      WHERE id = ${report.id}
    `;

    const snapshot = await getCaseSnapshot(report.id);
    const response = jsonResponse({
      data: {
        status: report.status,
        route:
          report.route_type === "independent_oversight"
            ? "Independent oversight"
            : "Internal ethics committee",
        category: payload.category,
        urgency: payload.urgency,
        title: payload.title,
        description: payload.description,
        evidenceCount: report.evidence_count,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        messages: snapshot?.messages ?? [],
        events: snapshot?.events ?? [],
        evidence: snapshot?.evidence ?? [],
      },
    });
    await createReporterSession(report.id, response);
    return response;
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
