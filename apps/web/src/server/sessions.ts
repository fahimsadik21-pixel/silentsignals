import type { NextResponse } from "next/server";
import { getDatabase } from "@/server/database";
import { generateOpaqueToken, hashOpaqueToken } from "@/server/security";

const reviewerCookie = "ss_reviewer_session";
const reporterCookie = "ss_case_session";

type ReviewerRow = {
  id: string;
  email: string;
  display_name: string;
  role: "reviewer" | "administrator";
  route_scope: "committee" | "independent_oversight" | "all";
};

export type ReviewerIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: ReviewerRow["role"];
  routeScope: ReviewerRow["route_scope"];
};

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }

  return null;
}

function sessionHours(name: "REVIEWER_SESSION_HOURS" | "REPORTER_SESSION_HOURS", fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 && value <= 168 ? value : fallback;
}

function setSessionCookie(response: NextResponse, name: string, token: string, hours: number) {
  response.cookies.set({
    name,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: hours * 60 * 60,
  });
}

export async function createReviewerSession(reviewerId: string, response: NextResponse) {
  const sql = getDatabase();
  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const hours = sessionHours("REVIEWER_SESSION_HOURS", 12);

  await sql`
    INSERT INTO reviewer_sessions (token_hash, reviewer_id, expires_at)
    VALUES (${tokenHash}, ${reviewerId}, now() + (${hours} * interval '1 hour'))
  `;
  setSessionCookie(response, reviewerCookie, token, hours);
}

export async function createReporterSession(reportId: string, response: NextResponse) {
  const sql = getDatabase();
  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const hours = sessionHours("REPORTER_SESSION_HOURS", 2);

  await sql`
    INSERT INTO reporter_sessions (token_hash, report_id, expires_at)
    VALUES (${tokenHash}, ${reportId}, now() + (${hours} * interval '1 hour'))
  `;
  setSessionCookie(response, reporterCookie, token, hours);
}

export async function getReviewerIdentity(request: Request): Promise<ReviewerIdentity | null> {
  const token = readCookie(request, reviewerCookie);
  if (!token) return null;

  const sql = getDatabase();
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.route_scope
    FROM reviewer_sessions s
    JOIN reviewer_users u ON u.id = s.reviewer_id
    WHERE s.token_hash = ${hashOpaqueToken(token)}
      AND s.expires_at > now()
      AND u.is_active = true
    LIMIT 1
  `;
  const reviewer = rows[0] as ReviewerRow | undefined;

  if (!reviewer) return null;

  await sql`
    UPDATE reviewer_sessions
    SET last_seen_at = now()
    WHERE token_hash = ${hashOpaqueToken(token)}
      AND last_seen_at < now() - interval '5 minutes'
  `;

  return {
    id: reviewer.id,
    email: reviewer.email,
    displayName: reviewer.display_name,
    role: reviewer.role,
    routeScope: reviewer.route_scope,
  };
}

export async function getReporterReportId(request: Request) {
  const token = readCookie(request, reporterCookie);
  if (!token) return null;

  const sql = getDatabase();
  const tokenHash = hashOpaqueToken(token);
  const rows = await sql`
    SELECT report_id
    FROM reporter_sessions
    WHERE token_hash = ${tokenHash}
      AND expires_at > now()
    LIMIT 1
  `;
  const reportId = rows[0]?.report_id as string | undefined;

  if (reportId) {
    await sql`
      UPDATE reporter_sessions
      SET last_seen_at = now()
      WHERE token_hash = ${tokenHash}
        AND last_seen_at < now() - interval '5 minutes'
    `;
  }

  return reportId ?? null;
}

export async function destroyReviewerSession(request: Request, response: NextResponse) {
  const token = readCookie(request, reviewerCookie);
  if (token) {
    const sql = getDatabase();
    await sql`DELETE FROM reviewer_sessions WHERE token_hash = ${hashOpaqueToken(token)}`;
  }
  response.cookies.set({ name: reviewerCookie, value: "", path: "/", maxAge: 0 });
}

export function clearReporterSession(response: NextResponse) {
  response.cookies.set({ name: reporterCookie, value: "", path: "/", maxAge: 0 });
}

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
