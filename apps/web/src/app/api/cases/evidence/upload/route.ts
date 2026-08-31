import { randomUUID } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getDatabase } from "@/server/database";
import { createEncryptedEvidenceMetadata } from "@/server/case-service";
import { requireServerEnv } from "@/server/config";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { evidenceUploadPayloadSchema } from "@/server/report-schema";
import { getReporterReportId, isSameOriginMutation } from "@/server/sessions";
import { createSecurityScope } from "@/server/security";
import { isRateLimited, recordSecurityEvent } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
  "video/webm",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    if (body.type === "blob.generate-client-token" && !isSameOriginMutation(request)) {
      return jsonResponse({ error: { code: "INVALID_ORIGIN", message: "Request rejected." } }, 403);
    }
    const token = requireServerEnv("BLOB_READ_WRITE_TOKEN");
    const result = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const reportId = await getReporterReportId(request);
        if (!reportId) throw new Error("Open the case again before uploading evidence.");
        if (!/^evidence\/[0-9a-f-]{36}$/i.test(pathname)) {
          throw new Error("Invalid evidence pathname.");
        }

        const parsedPayload = evidenceUploadPayloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null,
        );
        if (!parsedPayload.success || !allowedContentTypes.includes(parsedPayload.data.contentType)) {
          throw new Error("This evidence file type is not allowed.");
        }
        const uploadScope = createSecurityScope("evidence-upload", reportId);
        if (await isRateLimited(uploadScope, "evidence_upload", 10, 60)) {
          throw new Error("The temporary evidence upload limit has been reached.");
        }

        const sql = getDatabase();
        const counts = await sql`
          SELECT count(*)::int AS count
          FROM evidence_files
          WHERE report_id = ${reportId} AND status <> 'deleted'
        `;
        if (Number(counts[0]?.count ?? 0) >= 5) throw new Error("A case can contain up to five files.");

        const evidenceId = randomUUID();
        const metadata = createEncryptedEvidenceMetadata(parsedPayload.data.fileName);
        await sql`
          INSERT INTO evidence_files (
            id, report_id, metadata_ciphertext, metadata_iv, metadata_tag,
            encryption_version, content_type, byte_size, status
          ) VALUES (
            ${evidenceId}, ${reportId}, ${metadata.ciphertext}, ${metadata.iv}, ${metadata.tag},
            ${metadata.version}, ${parsedPayload.data.contentType}, ${parsedPayload.data.byteSize}, 'pending'
          )
        `;
        await recordSecurityEvent(uploadScope, "evidence_upload");

        return {
          allowedContentTypes,
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({ evidenceId, reportId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) throw new Error("Missing evidence upload context.");
        const payload = JSON.parse(tokenPayload) as { evidenceId: string; reportId: string };
        const sql = getDatabase();
        const eventId = randomUUID();

        await sql.transaction((transaction) => [
          transaction`
            UPDATE evidence_files
            SET storage_pathname = ${blob.pathname}, etag = ${blob.etag}, status = 'available',
              uploaded_at = now()
            WHERE id = ${payload.evidenceId} AND report_id = ${payload.reportId}
          `,
          transaction`
            UPDATE reports SET evidence_count = (
              SELECT count(*) FROM evidence_files
              WHERE report_id = ${payload.reportId} AND status = 'available'
            ), updated_at = now()
            WHERE id = ${payload.reportId}
          `,
          transaction`
            INSERT INTO case_events (id, report_id, event_type, public_status, actor_type)
            SELECT ${eventId}, id, 'evidence_added', status, 'reporter'
            FROM reports WHERE id = ${payload.reportId}
          `,
        ]);
      },
    });

    return jsonResponse(result);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
