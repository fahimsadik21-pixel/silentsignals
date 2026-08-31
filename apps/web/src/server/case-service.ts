import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import type { ReportInput } from "@/server/report-schema";
import { decryptPayload, encryptPayload, type EncryptedPayload } from "@/server/security";
import type { ReviewerIdentity } from "@/server/sessions";

type ReportRecord = {
  id: string;
  tracking_code: string;
  payload_ciphertext: string;
  payload_iv: string;
  payload_tag: string;
  encryption_version: number;
  status: string;
  route_type: string;
  urgency: string;
  evidence_count: number;
  priority: number;
  assigned_reviewer_id: string | null;
  assigned_reviewer_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type EvidenceMetadata = { fileName: string };

function encryptedPayloadFromRow(
  row: Record<string, unknown>,
  prefix: "payload" | "body" | "metadata" | "detail",
) {
  return {
    ciphertext: String(row[`${prefix}_ciphertext`]),
    iv: String(row[`${prefix}_iv`]),
    tag: String(row[`${prefix}_tag`]),
    version: Number(row.encryption_version) as EncryptedPayload["version"],
  };
}

export function reviewerCanAccessRoute(reviewer: ReviewerIdentity, routeType: string) {
  return (
    reviewer.role === "administrator" ||
    reviewer.routeScope === "all" ||
    reviewer.routeScope === routeType
  );
}

export async function reviewerCanAccessReport(reviewer: ReviewerIdentity, reportId: string) {
  const sql = getDatabase();
  const rows = await sql`SELECT route_type FROM reports WHERE id = ${reportId} LIMIT 1`;
  return Boolean(rows[0] && reviewerCanAccessRoute(reviewer, String(rows[0].route_type)));
}

export async function getCaseSnapshot(reportId: string) {
  const sql = getDatabase();
  const reportRows = await sql`
    SELECT
      r.id, r.tracking_code, r.payload_ciphertext, r.payload_iv, r.payload_tag,
      r.encryption_version, r.status, r.route_type, r.urgency, r.evidence_count,
      r.priority, r.assigned_reviewer_id, u.display_name AS assigned_reviewer_name,
      r.created_at, r.updated_at, r.resolved_at
    FROM reports r
    LEFT JOIN reviewer_users u ON u.id = r.assigned_reviewer_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `;
  const report = reportRows[0] as ReportRecord | undefined;
  if (!report) return null;

  const payload = decryptPayload<ReportInput>(encryptedPayloadFromRow(report, "payload"));
  const [messageRows, eventRows, evidenceRows] = await Promise.all([
    sql`
      SELECT id, sender_type, sender_reviewer_id, body_ciphertext, body_iv, body_tag,
        encryption_version, created_at
      FROM case_messages
      WHERE report_id = ${reportId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, event_type, public_status, actor_type, detail_ciphertext, detail_iv,
        detail_tag, encryption_version, created_at
      FROM case_events
      WHERE report_id = ${reportId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, metadata_ciphertext, metadata_iv, metadata_tag, encryption_version,
        content_type, byte_size, status, created_at, uploaded_at
      FROM evidence_files
      WHERE report_id = ${reportId} AND status <> 'deleted'
      ORDER BY created_at ASC
    `,
  ]);

  return {
    id: report.id,
    trackingCode: report.tracking_code,
    status: report.status,
    routeType: report.route_type,
    route:
      report.route_type === "independent_oversight"
        ? "Independent oversight"
        : "Internal ethics committee",
    urgency: report.urgency,
    priority: Number(report.priority),
    assignedReviewerId: report.assigned_reviewer_id,
    assignedReviewerName: report.assigned_reviewer_name,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    resolvedAt: report.resolved_at,
    evidenceCount: Number(report.evidence_count),
    report: payload,
    messages: messageRows.map((row) => ({
      id: String(row.id),
      sender: String(row.sender_type),
      body: decryptPayload<string>(encryptedPayloadFromRow(row as Record<string, unknown>, "body")),
      createdAt: String(row.created_at),
    })),
    events: eventRows.map((row) => ({
      id: String(row.id),
      type: String(row.event_type),
      status: String(row.public_status),
      actor: String(row.actor_type),
      detail:
        row.detail_ciphertext && row.detail_iv && row.detail_tag
          ? decryptPayload<string>(
              encryptedPayloadFromRow(row as Record<string, unknown>, "detail"),
            )
          : null,
      createdAt: String(row.created_at),
    })),
    evidence: evidenceRows.map((row) => ({
      id: String(row.id),
      name: decryptPayload<EvidenceMetadata>(
        encryptedPayloadFromRow(row as Record<string, unknown>, "metadata"),
      ).fileName,
      contentType: String(row.content_type),
      byteSize: Number(row.byte_size),
      status: String(row.status),
      createdAt: String(row.created_at),
      uploadedAt: row.uploaded_at ? String(row.uploaded_at) : null,
    })),
  };
}

export async function addCaseMessage(
  reportId: string,
  sender: "reporter" | "reviewer",
  body: string,
  reviewerId: string | null = null,
) {
  const sql = getDatabase();
  const encrypted = encryptPayload(body);
  const messageId = randomUUID();
  const eventId = randomUUID();

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO case_messages (
        id, report_id, sender_type, sender_reviewer_id,
        body_ciphertext, body_iv, body_tag, encryption_version,
        reporter_read_at, reviewer_read_at
      ) VALUES (
        ${messageId}, ${reportId}, ${sender}, ${reviewerId},
        ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, ${encrypted.version},
        ${sender === "reporter" ? new Date().toISOString() : null},
        ${sender === "reviewer" ? new Date().toISOString() : null}
      )
    `,
    transaction`
      INSERT INTO case_events (
        id, report_id, event_type, public_status, actor_type, actor_reviewer_id
      )
      SELECT ${eventId}, id, 'message_added', status, ${sender}, ${reviewerId}
      FROM reports WHERE id = ${reportId}
    `,
    transaction`UPDATE reports SET updated_at = now() WHERE id = ${reportId}`,
  ]);

  return messageId;
}

export async function writeAudit(
  reviewerId: string | null,
  reportId: string | null,
  action: string,
  scopeHash: string | null = null,
) {
  const sql = getDatabase();
  await sql`
    INSERT INTO audit_log (reviewer_id, report_id, action, scope_hash)
    VALUES (${reviewerId}, ${reportId}, ${action}, ${scopeHash})
  `;
}

export function createEncryptedEvidenceMetadata(fileName: string) {
  return encryptPayload({ fileName } satisfies EvidenceMetadata);
}
