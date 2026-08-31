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
  assigned_reviewer_public_id: string | null;
  assigned_team_id: string | null;
  assigned_team_public_id: string | null;
  assigned_team_label: string | null;
  lead_reviewer_id: string | null;
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
    reviewer.role === "reviewer" &&
    (reviewer.routeScope === "all" || reviewer.routeScope === routeType)
  );
}

export async function reviewerCanAccessReport(reviewer: ReviewerIdentity, reportId: string) {
  if (reviewer.role !== "reviewer") return false;
  const sql = getDatabase();
  const rows = await sql`
    SELECT r.route_type, r.assigned_team_id,
      EXISTS (
        SELECT 1 FROM reviewer_team_members m
        WHERE m.team_id = r.assigned_team_id AND m.reviewer_id = ${reviewer.id}
          AND m.is_active = true
      ) AS is_team_member
    FROM reports r WHERE r.id = ${reportId} LIMIT 1
  `;
  if (!rows[0]) return false;
  if (rows[0].assigned_team_id) return Boolean(rows[0].is_team_member);
  return reviewerCanAccessRoute(reviewer, String(rows[0].route_type));
}

export async function reviewerCanReplyToReport(reviewer: ReviewerIdentity, reportId: string) {
  if (reviewer.role !== "reviewer") return false;
  const sql = getDatabase();
  const rows = await sql`
    SELECT 1 FROM reports r
    JOIN reviewer_team_members m
      ON m.team_id = r.assigned_team_id AND m.reviewer_id = ${reviewer.id} AND m.is_active = true
    WHERE r.id = ${reportId} AND r.lead_reviewer_id = ${reviewer.id}
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

export async function getCaseSnapshot(reportId: string) {
  const sql = getDatabase();
  const reportRows = await sql`
    SELECT
      r.id, r.tracking_code, r.payload_ciphertext, r.payload_iv, r.payload_tag,
      r.encryption_version, r.status, r.route_type, r.urgency, r.evidence_count,
      r.priority, r.assigned_reviewer_id, u.public_id AS assigned_reviewer_public_id,
      r.assigned_team_id, t.public_id AS assigned_team_public_id, t.label AS assigned_team_label,
      r.lead_reviewer_id,
      r.created_at, r.updated_at, r.resolved_at
    FROM reports r
    LEFT JOIN reviewer_users u ON u.id = r.assigned_reviewer_id
    LEFT JOIN reviewer_teams t ON t.id = r.assigned_team_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `;
  const report = reportRows[0] as ReportRecord | undefined;
  if (!report) return null;

  const payload = decryptPayload<ReportInput>(encryptedPayloadFromRow(report, "payload"));
  const [messageRows, eventRows, evidenceRows] = await Promise.all([
    sql`
      SELECT m.id, m.sender_type, m.sender_reviewer_id, u.public_id AS sender_public_id,
        m.body_ciphertext, m.body_iv, m.body_tag, m.encryption_version, m.created_at
      FROM case_messages m
      LEFT JOIN reviewer_users u ON u.id = m.sender_reviewer_id
      WHERE m.report_id = ${reportId}
      ORDER BY m.created_at ASC
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
    assignedReviewerPublicId: report.assigned_reviewer_public_id,
    assignedTeamId: report.assigned_team_id,
    assignedTeamPublicId: report.assigned_team_public_id,
    assignedTeamLabel: report.assigned_team_label,
    leadReviewerId: report.lead_reviewer_id,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    resolvedAt: report.resolved_at,
    evidenceCount: Number(report.evidence_count),
    report: payload,
    messages: messageRows.map((row) => ({
      id: String(row.id),
      sender: String(row.sender_type),
      senderPublicId: row.sender_public_id ? String(row.sender_public_id) : null,
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

export async function getCaseInternalNotes(reportId: string, teamId: string) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT n.id, n.body_ciphertext, n.body_iv, n.body_tag, n.encryption_version,
      n.created_at, u.public_id AS author_public_id
    FROM case_internal_notes n
    LEFT JOIN reviewer_users u ON u.id = n.author_reviewer_id
    WHERE n.report_id = ${reportId} AND n.team_id = ${teamId}
    ORDER BY n.created_at ASC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    authorPublicId: row.author_public_id ? String(row.author_public_id) : "Former reviewer",
    body: decryptPayload<string>(encryptedPayloadFromRow(row as Record<string, unknown>, "body")),
    createdAt: String(row.created_at),
  }));
}

export async function addCaseInternalNote(
  reportId: string,
  teamId: string,
  reviewerId: string,
  body: string,
) {
  const sql = getDatabase();
  const encrypted = encryptPayload(body);
  const noteId = randomUUID();
  await sql`
    INSERT INTO case_internal_notes (
      id, report_id, team_id, author_reviewer_id,
      body_ciphertext, body_iv, body_tag, encryption_version
    ) VALUES (
      ${noteId}, ${reportId}, ${teamId}, ${reviewerId},
      ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, ${encrypted.version}
    )
  `;
  return noteId;
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
