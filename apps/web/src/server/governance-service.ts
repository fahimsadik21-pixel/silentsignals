import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import { hashOpaqueToken, hashPassword, normalizeTeamInviteCode, generateTeamInviteCode } from "@/server/security";
import type { ReviewerIdentity } from "@/server/sessions";

type TeamType = "committee" | "independent_oversight";

function compactId(prefix: "GOV" | "REV" | "REQ" | "TEAM", id = randomUUID()) {
  return `${prefix}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function requireAdministrator(identity: ReviewerIdentity) {
  if (identity.role !== "administrator") throw new Error("GOVERNANCE_ACCESS_REQUIRED");
}

export async function getGovernanceSnapshot(identity: ReviewerIdentity) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const [teamRows, memberRows, requestRows] = await Promise.all([
    sql`
      SELECT t.id, t.public_id, t.label, t.team_type, t.capacity, t.status,
        count(m.reviewer_id)::int AS member_count,
        max(CASE WHEN m.member_role = 'lead' THEN u.public_id END) AS lead_public_id
      FROM reviewer_teams t
      LEFT JOIN reviewer_team_members m ON m.team_id = t.id AND m.is_active = true
      LEFT JOIN reviewer_users u ON u.id = m.reviewer_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `,
    sql`
      SELECT m.team_id, u.public_id, m.member_role, u.availability
      FROM reviewer_team_members m
      JOIN reviewer_users u ON u.id = m.reviewer_id
      WHERE m.is_active = true
      ORDER BY m.joined_at ASC
    `,
    sql`
      SELECT r.id, r.public_id, r.status, r.requested_at, r.decided_at,
        u.public_id AS reviewer_public_id, t.public_id AS team_public_id,
        t.label AS team_label, t.team_type,
        count(a.administrator_id) FILTER (WHERE a.decision = 'approve')::int AS approval_count,
        bool_or(a.administrator_id = ${identity.id} AND a.decision = 'approve') AS approved_by_me
      FROM reviewer_registration_requests r
      JOIN reviewer_users u ON u.id = r.reviewer_id
      JOIN reviewer_teams t ON t.id = r.team_id
      LEFT JOIN reviewer_registration_approvals a ON a.request_id = r.id
      GROUP BY r.id, u.public_id, t.public_id, t.label, t.team_type
      ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.requested_at DESC
      LIMIT 80
    `,
  ]);

  const membersByTeam = new Map<string, Array<Record<string, string>>>();
  for (const row of memberRows) {
    const teamId = String(row.team_id);
    const members = membersByTeam.get(teamId) ?? [];
    members.push({
      publicId: String(row.public_id),
      role: String(row.member_role),
      availability: String(row.availability),
    });
    membersByTeam.set(teamId, members);
  }

  const teams = teamRows.map((row) => ({
    id: String(row.id),
    publicId: String(row.public_id),
    label: String(row.label),
    teamType: String(row.team_type),
    capacity: Number(row.capacity),
    memberCount: Number(row.member_count),
    status: String(row.status),
    leadPublicId: row.lead_public_id ? String(row.lead_public_id) : null,
    members: membersByTeam.get(String(row.id)) ?? [],
  }));
  const requests = requestRows.map((row) => ({
    id: String(row.id),
    publicId: String(row.public_id),
    reviewerPublicId: String(row.reviewer_public_id),
    teamPublicId: String(row.team_public_id),
    teamLabel: String(row.team_label),
    teamType: String(row.team_type),
    status: String(row.status),
    approvalCount: Number(row.approval_count),
    approvedByMe: Boolean(row.approved_by_me),
    requestedAt: String(row.requested_at),
  }));

  return {
    teams,
    requests,
    metrics: {
      teams: teams.length,
      activeTeams: teams.filter((team) => team.status === "active").length,
      protectedTeams: teams.filter((team) => team.teamType === "independent_oversight").length,
      pendingApprovals: requests.filter((request) => request.status === "pending").length,
    },
  };
}

export async function createReviewerTeam(
  identity: ReviewerIdentity,
  input: { label: string; teamType: TeamType },
) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const teamId = randomUUID();
  const teamPublicId = compactId("TEAM", teamId);
  const inviteCodes = Array.from({ length: 5 }, () => generateTeamInviteCode());
  const inviteIds = inviteCodes.map(() => randomUUID());

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO reviewer_teams (id, public_id, team_type, label, created_by)
      VALUES (${teamId}, ${teamPublicId}, ${input.teamType}, ${input.label}, ${identity.id})
    `,
    ...inviteCodes.map((code, index) => transaction`
      INSERT INTO reviewer_team_invites (
        id, team_id, token_hash, slot_number, created_by, expires_at
      ) VALUES (
        ${inviteIds[index]}, ${teamId}, ${hashOpaqueToken(normalizeTeamInviteCode(code))},
        ${index + 1}, ${identity.id}, now() + interval '14 days'
      )
    `),
  ]);

  return { id: teamId, publicId: teamPublicId, inviteCodes };
}

export async function registerReviewer(input: {
  email: string;
  password: string;
  inviteCode: string;
}) {
  const sql = getDatabase();
  const inviteHash = hashOpaqueToken(normalizeTeamInviteCode(input.inviteCode));
  const inviteRows = await sql`
    SELECT i.id, i.team_id, t.team_type
    FROM reviewer_team_invites i
    JOIN reviewer_teams t ON t.id = i.team_id
    WHERE i.token_hash = ${inviteHash}
      AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      AND t.status IN ('forming', 'active')
    LIMIT 1
  `;
  const invite = inviteRows[0];
  if (!invite) throw new Error("INVALID_INVITE");

  const existing = await sql`SELECT 1 FROM reviewer_users WHERE lower(email) = ${input.email} LIMIT 1`;
  if (existing[0]) throw new Error("ACCOUNT_EXISTS");

  const reviewerId = randomUUID();
  const requestId = randomUUID();
  const reviewerPublicId = compactId("REV", reviewerId);
  const requestPublicId = compactId("REQ", requestId);
  const passwordHash = await hashPassword(input.password);

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO reviewer_users (
        id, email, display_name, password_hash, role, route_scope, is_active,
        public_id, account_status, availability
      ) VALUES (
        ${reviewerId}, ${input.email}, ${reviewerPublicId}, ${passwordHash}, 'reviewer',
        ${String(invite.team_type)}, false, ${reviewerPublicId}, 'pending', 'offline'
      )
    `,
    transaction`
      INSERT INTO reviewer_registration_requests (
        id, public_id, reviewer_id, team_id, invite_id
      ) VALUES (
        ${requestId}, ${requestPublicId}, ${reviewerId}, ${String(invite.team_id)}, ${String(invite.id)}
      )
    `,
    transaction`
      UPDATE reviewer_team_invites
      SET used_by = ${reviewerId}, used_at = now()
      WHERE id = ${String(invite.id)} AND used_at IS NULL
    `,
  ]);

  return { requestPublicId, reviewerPublicId, status: "pending" as const };
}

export async function decideRegistration(
  identity: ReviewerIdentity,
  input: { requestId: string; decision: "approve" | "reject" },
) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const requestRows = await sql`
    SELECT r.id, r.reviewer_id, r.team_id, r.status, t.capacity, t.team_type
    FROM reviewer_registration_requests r
    JOIN reviewer_teams t ON t.id = r.team_id
    WHERE r.id = ${input.requestId}
    LIMIT 1
  `;
  const registration = requestRows[0];
  if (!registration || registration.status !== "pending") throw new Error("REQUEST_NOT_PENDING");

  await sql`
    INSERT INTO reviewer_registration_approvals (request_id, administrator_id, decision)
    VALUES (${input.requestId}, ${identity.id}, ${input.decision})
    ON CONFLICT (request_id, administrator_id) DO UPDATE
      SET decision = EXCLUDED.decision, created_at = now()
  `;

  if (input.decision === "reject") {
    await sql.transaction((transaction) => [
      transaction`
        UPDATE reviewer_registration_requests
        SET status = 'rejected', decided_at = now() WHERE id = ${input.requestId}
      `,
      transaction`
        UPDATE reviewer_users
        SET account_status = 'rejected', is_active = false, updated_at = now()
        WHERE id = ${String(registration.reviewer_id)}
      `,
    ]);
    return { status: "rejected" as const, approvalCount: 0 };
  }

  const approvalRows = await sql`
    SELECT count(*)::int AS count
    FROM reviewer_registration_approvals
    WHERE request_id = ${input.requestId} AND decision = 'approve'
  `;
  const approvalCount = Number(approvalRows[0]?.count ?? 0);
  if (approvalCount < 2) return { status: "pending" as const, approvalCount };

  const memberRows = await sql`
    SELECT count(*)::int AS count
    FROM reviewer_team_members
    WHERE team_id = ${String(registration.team_id)} AND is_active = true
  `;
  const memberCount = Number(memberRows[0]?.count ?? 0);
  if (memberCount >= Number(registration.capacity)) throw new Error("TEAM_FULL");
  const memberRole = memberCount === 0 ? "lead" : "member";
  const teamBecomesActive = memberCount + 1 === Number(registration.capacity);

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO reviewer_team_members (team_id, reviewer_id, member_role)
      VALUES (${String(registration.team_id)}, ${String(registration.reviewer_id)}, ${memberRole})
      ON CONFLICT (team_id, reviewer_id) DO UPDATE SET is_active = true
    `,
    transaction`
      UPDATE reviewer_users SET account_status = 'active', is_active = true,
        approved_at = now(), updated_at = now()
      WHERE id = ${String(registration.reviewer_id)}
    `,
    transaction`
      UPDATE reviewer_registration_requests SET status = 'approved', decided_at = now()
      WHERE id = ${input.requestId}
    `,
    transaction`
      UPDATE reviewer_teams SET status = ${teamBecomesActive ? "active" : "forming"}, updated_at = now()
      WHERE id = ${String(registration.team_id)}
    `,
  ]);

  if (teamBecomesActive) {
    const leadRows = await sql`
      SELECT reviewer_id FROM reviewer_team_members
      WHERE team_id = ${String(registration.team_id)} AND member_role = 'lead' AND is_active = true
      LIMIT 1
    `;
    const leadId = leadRows[0]?.reviewer_id ? String(leadRows[0].reviewer_id) : null;
    if (leadId) {
      await sql`
        UPDATE reports SET assigned_team_id = ${String(registration.team_id)},
          lead_reviewer_id = ${leadId}, assigned_reviewer_id = ${leadId}, updated_at = now()
        WHERE assigned_team_id IS NULL AND route_type = ${String(registration.team_type)}
          AND status NOT IN ('resolved', 'closed')
      `;
    }
  }

  return { status: "approved" as const, approvalCount };
}

export async function findTeamForNewReport(teamType: TeamType) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT t.id AS team_id, lead.reviewer_id AS lead_reviewer_id
    FROM reviewer_teams t
    JOIN reviewer_team_members lead
      ON lead.team_id = t.id AND lead.member_role = 'lead' AND lead.is_active = true
    WHERE t.team_type = ${teamType} AND t.status = 'active'
      AND (SELECT count(*) FROM reviewer_team_members m WHERE m.team_id = t.id AND m.is_active = true) = 5
    ORDER BY (
      SELECT count(*) FROM reports r
      WHERE r.assigned_team_id = t.id AND r.status NOT IN ('resolved', 'closed')
    ) ASC, t.created_at ASC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { teamId: String(rows[0].team_id), leadReviewerId: String(rows[0].lead_reviewer_id) };
}
