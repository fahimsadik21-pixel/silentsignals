import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import {
  hashOpaqueToken,
  hashPassword,
  normalizeTeamInviteCode,
  generateTeamInviteCode,
  normalizeAccessKey,
} from "@/server/security";
import type { ReviewerIdentity } from "@/server/sessions";

type TeamType = "committee" | "independent_oversight";

function compactId(prefix: "GOV" | "REV" | "REQ" | "TEAM", id = randomUUID()) {
  return `${prefix}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function requireAdministrator(identity: ReviewerIdentity) {
  if (identity.role !== "administrator")
    throw new Error("GOVERNANCE_ACCESS_REQUIRED");
}

export async function getGovernanceSnapshot(identity: ReviewerIdentity) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const [teamRows, memberRows, requestRows, inviteRows] = await Promise.all([
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
        COALESCE(r.reviewer_name, u.display_name) AS reviewer_name,
        COALESCE(r.requested_email, u.email) AS reviewer_email,
        t.public_id AS team_public_id, t.label AS team_label, t.team_type,
        count(a.administrator_id) FILTER (WHERE a.decision = 'approve')::int AS approval_count,
        bool_or(a.administrator_id = ${identity.id} AND a.decision = 'approve') AS approved_by_me,
        i.private_key, i.slot_number
      FROM reviewer_registration_requests r
      JOIN reviewer_users u ON u.id = r.reviewer_id
      JOIN reviewer_teams t ON t.id = r.team_id
      LEFT JOIN reviewer_team_invites i ON i.id = r.invite_id
      LEFT JOIN reviewer_registration_approvals a ON a.request_id = r.id
      GROUP BY r.id, u.public_id, u.display_name, u.email, t.public_id, t.label, t.team_type, i.private_key, i.slot_number
      ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.requested_at DESC
      LIMIT 80
    `,
    sql`
      SELECT i.team_id, i.slot_number, i.private_key, i.reviewer_email, i.reviewer_name, i.assigned_at,
        u.public_id AS reviewer_public_id
      FROM reviewer_team_invites i
      LEFT JOIN reviewer_users u ON u.id = i.assigned_reviewer_id
      ORDER BY i.team_id, i.slot_number
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
    slots: (inviteRows.filter((slot) => slot.team_id === row.id) ?? []).map(
      (slot) => ({
        slotNumber: Number(slot.slot_number),
        privateKey: slot.private_key ? String(slot.private_key) : null,
        assignedReviewerEmail: slot.reviewer_email
          ? String(slot.reviewer_email)
          : null,
        assignedReviewerName: slot.reviewer_name
          ? String(slot.reviewer_name)
          : null,
        assignedReviewerPublicId: slot.reviewer_public_id
          ? String(slot.reviewer_public_id)
          : null,
        assignedAt: slot.assigned_at ? String(slot.assigned_at) : null,
      }),
    ),
  }));
  const requests = requestRows.map((row) => ({
    id: String(row.id),
    publicId: String(row.public_id),
    reviewerPublicId: String(row.reviewer_public_id),
    reviewerName: String(row.reviewer_name),
    reviewerEmail: String(row.reviewer_email),
    teamPublicId: String(row.team_public_id),
    teamLabel: String(row.team_label),
    teamType: String(row.team_type),
    status: String(row.status),
    approvalCount: Number(row.approval_count),
    approvedByMe: Boolean(row.approved_by_me),
    requestedAt: String(row.requested_at),
    privateKey: row.private_key ? String(row.private_key) : null,
    slotNumber: row.slot_number ? Number(row.slot_number) : null,
  }));

  return {
    teams,
    requests,
    metrics: {
      teams: teams.length,
      activeTeams: teams.filter((team) => team.status === "active").length,
      protectedTeams: teams.filter(
        (team) => team.teamType === "independent_oversight",
      ).length,
      pendingApprovals: requests.filter(
        (request) => request.status === "pending",
      ).length,
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
    ...inviteCodes.map(
      (code, index) => transaction`
      INSERT INTO reviewer_team_invites (
        id, team_id, token_hash, slot_number, created_by, expires_at, private_key
      ) VALUES (
        ${inviteIds[index]}, ${teamId}, ${hashOpaqueToken(normalizeTeamInviteCode(code))},
        ${index + 1}, ${identity.id}, now() + interval '14 days', ${code}
      )
    `,
    ),
  ]);

  return { id: teamId, publicId: teamPublicId, inviteCodes };
}

export async function registerReviewer(input: {
  name: string;
  email: string;
  department?: string;
}) {
  const sql = getDatabase();
  const existing =
    await sql`SELECT 1 FROM reviewer_users WHERE lower(email) = ${input.email} LIMIT 1`;
  if (existing[0]) throw new Error("ACCOUNT_EXISTS");

  const reviewerId = randomUUID();
  const requestId = randomUUID();
  const reviewerPublicId = compactId("REV", reviewerId);
  const requestPublicId = compactId("REQ", requestId);

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO reviewer_users (
        id, email, display_name, password_hash, role, route_scope, is_active,
        public_id, account_status, availability
      ) VALUES (
        ${reviewerId}, ${input.email}, ${input.name}, ${hashOpaqueToken(randomUUID())}, 'reviewer',
        'committee', false, ${reviewerPublicId}, 'pending', 'offline'
      )
    `,
    transaction`
      INSERT INTO reviewer_registration_requests (
        id, public_id, reviewer_id, reviewer_name, department, requested_email
      ) VALUES (
        ${requestId}, ${requestPublicId}, ${reviewerId}, ${input.name}, ${input.department ?? ""}, ${input.email}
      )
    `,
  ]);

  return { requestPublicId, reviewerPublicId, status: "pending" as const };
}

export async function registerInitialAdministrator(input: {
  email: string;
  password: string;
}) {
  const sql = getDatabase();
  const administratorId = randomUUID();
  const publicId = compactId("GOV", administratorId);
  const passwordHash = await hashPassword(input.password);

  const results = await sql.transaction((transaction) => [
    transaction`SELECT pg_advisory_xact_lock(hashtext('silentsignals-governance-bootstrap'))`,
    transaction`
      INSERT INTO reviewer_users (
        id, email, display_name, password_hash, role, route_scope, is_active,
        public_id, account_status, availability, approved_at
      )
      SELECT
        ${administratorId}, ${input.email}, ${publicId}, ${passwordHash}, 'administrator',
        'all', true, ${publicId}, 'active', 'offline', now()
      WHERE NOT EXISTS (
        SELECT 1 FROM reviewer_users WHERE role = 'administrator'
      )
      RETURNING id, public_id
    `,
  ]);

  const created = results[1]?.[0];
  if (!created) throw new Error("GOVERNANCE_ALREADY_INITIALIZED");

  return { id: String(created.id), publicId: String(created.public_id) };
}

export async function decideRegistration(
  identity: ReviewerIdentity,
  input: {
    requestId: string;
    decision: "approve" | "reject";
    teamId?: string;
    slotNumber?: number;
  },
) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const requestRows = await sql`
    SELECT r.id, r.reviewer_id, r.team_id, r.status, r.reviewer_name, r.requested_email,
      t.capacity, t.team_type, t.public_id AS team_public_id
    FROM reviewer_registration_requests r
    LEFT JOIN reviewer_teams t ON t.id = r.team_id
    WHERE r.id = ${input.requestId}
    LIMIT 1
  `;
  const registration = requestRows[0];
  if (!registration || registration.status !== "pending")
    throw new Error("REQUEST_NOT_PENDING");

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

  const targetTeamId = input.teamId ?? String(registration.team_id);
  const slotNumber = input.slotNumber ?? 1;
  if (!targetTeamId) throw new Error("TEAM_REQUIRED");

  const slotRows = await sql`
    SELECT id, private_key, assigned_reviewer_id, slot_number
    FROM reviewer_team_invites
    WHERE team_id = ${targetTeamId} AND slot_number = ${slotNumber}
      AND assigned_reviewer_id IS NULL
    LIMIT 1
  `;
  const slot = slotRows[0];
  if (!slot) throw new Error("SLOT_UNAVAILABLE");

  const memberRows = await sql`
    SELECT count(*)::int AS count
    FROM reviewer_team_members
    WHERE team_id = ${targetTeamId} AND is_active = true
  `;
  const memberCount = Number(memberRows[0]?.count ?? 0);
  if (memberCount >= 5) throw new Error("TEAM_FULL");

  const memberRole = memberCount === 0 ? "lead" : "member";
  const teamBecomesActive = memberCount + 1 === 5;
  const privateKey = String(slot.private_key ?? "");

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO reviewer_team_members (team_id, reviewer_id, member_role)
      VALUES (${targetTeamId}, ${String(registration.reviewer_id)}, ${memberRole})
      ON CONFLICT (team_id, reviewer_id) DO UPDATE SET is_active = true
    `,
    transaction`
      UPDATE reviewer_users SET account_status = 'active', is_active = true,
        display_name = ${String(registration.reviewer_name ?? "")}, approved_at = now(), updated_at = now(),
        email = ${String(registration.requested_email ?? "")}
      WHERE id = ${String(registration.reviewer_id)}
    `,
    transaction`
      UPDATE reviewer_team_invites
      SET assigned_reviewer_id = ${String(registration.reviewer_id)},
          reviewer_email = ${String(registration.requested_email ?? "")},
          reviewer_name = ${String(registration.reviewer_name ?? "")},
          assigned_at = now(), approved_at = now(), used_by = ${String(registration.reviewer_id)}, used_at = now()
      WHERE id = ${String(slot.id)}
    `,
    transaction`
      UPDATE reviewer_registration_requests
      SET status = 'approved', team_id = ${targetTeamId}, invite_id = ${String(slot.id)},
          decided_at = now(), requested_email = ${String(registration.requested_email ?? "")}
      WHERE id = ${input.requestId}
    `,
    transaction`
      UPDATE reviewer_teams SET status = ${teamBecomesActive ? "active" : "forming"}, updated_at = now()
      WHERE id = ${targetTeamId}
    `,
    transaction`
      INSERT INTO reviewer_registration_approvals (request_id, administrator_id, decision)
      VALUES (${input.requestId}, ${identity.id}, ${input.decision})
      ON CONFLICT (request_id, administrator_id) DO UPDATE
        SET decision = EXCLUDED.decision, created_at = now()
    `,
  ]);

  return {
    status: "approved" as const,
    approvalCount: 1,
    privateKey,
    slotNumber,
    reviewerEmail: String(registration.requested_email ?? ""),
  };
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
  return {
    teamId: String(rows[0].team_id),
    leadReviewerId: String(rows[0].lead_reviewer_id),
  };
}

export async function deleteUnusedTeam(
  identity: ReviewerIdentity,
  teamId: string,
) {
  requireAdministrator(identity);
  const sql = getDatabase();
  const rows = await sql`
    SELECT t.id, count(m.reviewer_id)::int AS member_count
    FROM reviewer_teams t
    LEFT JOIN reviewer_team_members m ON m.team_id = t.id AND m.is_active = true
    WHERE t.id = ${teamId}
    GROUP BY t.id
    LIMIT 1
  `;
  const team = rows[0];
  if (!team) throw new Error("TEAM_NOT_FOUND");
  if (Number(team.member_count) > 0)
    throw new Error("TEAM_HAS_ACTIVE_REVIEWERS");

  await sql.transaction((transaction) => [
    transaction`DELETE FROM reviewer_team_invites WHERE team_id = ${teamId}`,
    transaction`DELETE FROM reviewer_teams WHERE id = ${teamId}`,
  ]);

  return { deleted: true };
}

export async function validateReviewerLogin(input: {
  email: string;
  privateKey: string;
}) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.account_status, u.is_active,
      i.private_key, i.assigned_reviewer_id, i.assigned_at, i.approved_at
    FROM reviewer_users u
    JOIN reviewer_team_invites i ON i.assigned_reviewer_id = u.id
    WHERE lower(u.email) = ${input.email.toLowerCase()}
      AND i.private_key = ${normalizeAccessKey(input.privateKey)}
      AND i.assigned_reviewer_id IS NOT NULL
      AND i.approved_at IS NOT NULL
      AND u.is_active = true
      AND u.account_status = 'active'
    LIMIT 1
  `;

  if (!rows[0]) throw new Error("INVALID_LOGIN");
  return {
    id: String(rows[0].id),
    email: String(rows[0].email),
    displayName: String(rows[0].display_name),
  };
}
