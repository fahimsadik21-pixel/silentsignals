import { get } from "@vercel/blob";
import { decryptPayload, type EncryptedPayload } from "@/server/security";
import { getDatabase } from "@/server/database";
import { requireServerEnv } from "@/server/config";
import { reviewerCanAccessRoute, writeAudit } from "@/server/case-service";
import { jsonResponse, serviceErrorResponse } from "@/server/http";
import { getReporterReportId, getReviewerIdentity } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvidenceRow = {
  id: string;
  report_id: string;
  route_type: string;
  storage_pathname: string | null;
  metadata_ciphertext: string;
  metadata_iv: string;
  metadata_tag: string;
  encryption_version: number;
  content_type: string;
  status: string;
};

export async function GET(request: Request, context: RouteContext<"/api/cases/evidence/[id]">) {
  try {
    const { id } = await context.params;
    const sql = getDatabase();
    const rows = await sql`
      SELECT e.id, e.report_id, r.route_type, e.storage_pathname, e.metadata_ciphertext,
        e.metadata_iv, e.metadata_tag, e.encryption_version, e.content_type, e.status
      FROM evidence_files e
      JOIN reports r ON r.id = e.report_id
      WHERE e.id = ${id}
      LIMIT 1
    `;
    const evidence = rows[0] as EvidenceRow | undefined;
    if (!evidence || evidence.status !== "available" || !evidence.storage_pathname) {
      return jsonResponse({ error: { code: "EVIDENCE_NOT_FOUND" } }, 404);
    }

    const reporterReportId = await getReporterReportId(request);
    const reviewer = reporterReportId ? null : await getReviewerIdentity(request);
    const authorized =
      reporterReportId === evidence.report_id ||
      Boolean(reviewer && reviewerCanAccessRoute(reviewer, evidence.route_type));
    if (!authorized) return jsonResponse({ error: { code: "EVIDENCE_NOT_FOUND" } }, 404);

    const result = await get(evidence.storage_pathname, {
      access: "private",
      token: requireServerEnv("BLOB_READ_WRITE_TOKEN"),
    });
    if (!result || result.statusCode !== 200) {
      return jsonResponse({ error: { code: "EVIDENCE_NOT_FOUND" } }, 404);
    }

    const metadata = decryptPayload<{ fileName: string }>({
      ciphertext: evidence.metadata_ciphertext,
      iv: evidence.metadata_iv,
      tag: evidence.metadata_tag,
      version: evidence.encryption_version as EncryptedPayload["version"],
    });
    const safeName = metadata.fileName.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "evidence";
    if (reviewer) await writeAudit(reviewer.id, evidence.report_id, "evidence_downloaded");

    return new Response(result.stream, {
      headers: {
        "Content-Type": evidence.content_type,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
