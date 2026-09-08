const DEFAULT_API_BASE_URL = "https://silentsignals-web.vercel.app";

const env = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

export const API_BASE_URL = (
  env.process?.env?.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, "");

export type ReporterRole = "student" | "faculty" | "staff" | "other";
export type ReportTarget =
  | "student"
  | "faculty"
  | "department"
  | "leadership"
  | "vice_chancellor";
export type UrgencyLevel = "standard" | "urgent" | "immediate";
export type Availability = "available" | "away" | "offline";

export type ReportInput = {
  reporterRole: ReporterRole;
  category: string;
  urgency: UrgencyLevel;
  target: ReportTarget;
  department?: string;
  title: string;
  description: string;
  incidentDate?: string;
  location?: string;
  consent: true;
};

export type ReportReceipt = {
  trackingCode: string;
  accessKey: string;
  status: string;
};

export type ReporterMessage = {
  id: string;
  sender: "reporter" | "reviewer";
  senderPublicId: string | null;
  body: string;
  createdAt: string;
};

export type CaseEvent = {
  id: string;
  type: string;
  status: string;
  actor: string;
  detail: string | null;
  createdAt: string;
};

export type CaseEvidence = {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  status: string;
  createdAt: string;
  uploadedAt: string | null;
};

export type CaseSnapshot = {
  id: string;
  trackingCode: string;
  status: string;
  routeType: string;
  route: string;
  urgency: UrgencyLevel;
  priority: number;
  assignedReviewerId: string | null;
  assignedReviewerPublicId: string | null;
  assignedTeamId: string | null;
  assignedTeamPublicId: string | null;
  assignedTeamLabel: string | null;
  leadReviewerId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  evidenceCount: number;
  report: ReportInput;
  messages: ReporterMessage[];
  events: CaseEvent[];
  evidence: CaseEvidence[];
};

export type ReviewerIdentity = {
  id: string;
  displayName: string;
  publicId: string;
  role: "reviewer" | "administrator";
  routeScope: "committee" | "independent_oversight" | "all";
  availability: Availability;
  teamId: string | null;
  teamPublicId: string | null;
  teamLabel: string | null;
  teamType: "committee" | "independent_oversight" | null;
  teamRole: "lead" | "member" | null;
};

export type ReviewerCaseSummary = {
  id: string;
  trackingCode: string;
  title: string;
  category: string;
  status: string;
  routeType: string;
  urgency: UrgencyLevel;
  priority: number;
  evidenceCount: number;
  assignedReviewerId: string | null;
  assignedReviewerPublicId: string | null;
  assignedReviewerName: string | null;
  assignedTeamId: string | null;
  teamPublicId: string | null;
  teamLabel: string | null;
  canReply: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReviewerCaseDetail = CaseSnapshot & {
  internalNotes: Array<{
    id: string;
    authorPublicId: string;
    body: string;
    createdAt: string;
  }>;
  canReply: boolean;
  viewerTeamRole: "lead" | "member" | null;
};

export type ReviewerDashboard = {
  cases: ReviewerCaseSummary[];
  metrics: {
    total: number;
    urgent: number;
    unassigned: number;
    awaitingReporter: number;
  };
  reviewer: ReviewerIdentity;
};

export type GovernanceTeamSlot = {
  slotNumber: number;
  privateKey: string | null;
  assignedReviewerEmail: string | null;
  assignedReviewerName: string | null;
  assignedReviewerPublicId: string | null;
  assignedAt: string | null;
};

export type GovernanceTeam = {
  id: string;
  publicId: string;
  label: string;
  teamType: "committee" | "independent_oversight";
  capacity: number;
  memberCount: number;
  status: string;
  leadPublicId: string | null;
  members: Array<{
    publicId: string;
    role: string;
    availability: Availability;
  }>;
  slots: GovernanceTeamSlot[];
};

export type GovernanceRequest = {
  id: string;
  publicId: string;
  reviewerPublicId: string;
  reviewerName: string;
  reviewerEmail: string;
  teamPublicId: string | null;
  teamLabel: string | null;
  teamType: string | null;
  status: string;
  approvalCount: number;
  approvedByMe: boolean;
  requestedAt: string;
  privateKey: string | null;
  slotNumber: number | null;
};

export type GovernanceDashboard = {
  teams: GovernanceTeam[];
  requests: GovernanceRequest[];
  metrics: {
    teams: number;
    activeTeams: number;
    protectedTeams: number;
    pendingApprovals: number;
  };
};

export type GovernanceCreateTeamResult = {
  id: string;
  publicId: string;
  inviteCodes: string[];
};

export type GovernanceDecisionResult = {
  status: "approved" | "rejected";
  approvalCount: number;
  privateKey?: string;
  slotNumber?: number;
  reviewerEmail?: string;
};

export type ReviewerRegistrationResult = {
  requestPublicId: string;
  reviewerPublicId: string;
  status: "pending";
};

export type EvidenceUploadTokenInput = {
  pathname: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  multipart: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toJsonHeaders(headers?: HeadersInit, body?: BodyInit | null) {
  const next = new Headers(headers ?? undefined);
  next.set("x-silentsignals-client", "mobile");
  if (body !== undefined && body !== null && !next.has("content-type")) {
    next.set("content-type", "application/json");
  }
  return next;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as T;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: toJsonHeaders(init.headers, init.body ?? null),
  });
  const payload = await readJsonResponse<
    { data?: T; error?: { code?: string; message?: string } } | T
  >(response);

  if (!response.ok) {
    const errorEnvelope = payload as { error?: { code?: string; message?: string } };
    throw new ApiError(
      response.status,
      errorEnvelope.error?.code ?? "REQUEST_FAILED",
      errorEnvelope.error?.message ?? `Request failed with status ${response.status}.`,
      payload,
    );
  }

  const envelope = payload as { data?: T };
  return (envelope.data ?? payload) as T;
}

export async function getCurrentCase() {
  return request<{ data: CaseSnapshot }>("/api/cases/current", { method: "GET" }).then(
    (payload) => payload.data,
  );
}

export async function submitReport(input: ReportInput) {
  return request<{ data: ReportReceipt }>("/api/reports", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function openCase(input: { trackingCode: string; accessKey: string }) {
  return request<{ data: CaseSnapshot }>("/api/cases/access", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function sendReporterMessage(body: string) {
  return request<{ data: CaseSnapshot }>("/api/cases/messages", {
    method: "POST",
    body: JSON.stringify({ body }),
  }).then((payload) => payload.data);
}

export async function loginReviewer(input: { email: string; privateKey?: string; password?: string }) {
  return request<{ data: { authenticated: boolean } }>("/api/reviewer/session", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function getReviewerSession() {
  return request<{ data: ReviewerIdentity }>("/api/reviewer/session", {
    method: "GET",
  }).then((payload) => payload.data);
}

export async function signOutReviewer() {
  return request<{ data: { authenticated: boolean } }>("/api/reviewer/session", {
    method: "DELETE",
  }).then((payload) => payload.data);
}

export async function getReviewerCases(params?: {
  status?: string;
  urgency?: string;
  query?: string;
  assignment?: string;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.urgency) search.set("urgency", params.urgency);
  if (params?.query) search.set("query", params.query);
  if (params?.assignment) search.set("assignment", params.assignment);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return request<{ data: ReviewerDashboard }>(`/api/reviewer/cases${suffix}`, {
    method: "GET",
  }).then((payload) => payload.data);
}

export async function getReviewerCase(id: string) {
  return request<{ data: ReviewerCaseDetail }>(`/api/reviewer/cases/${id}`, {
    method: "GET",
  }).then((payload) => payload.data);
}

export async function updateReviewerCase(
  id: string,
  input: {
    status?: string;
    priority?: number;
    assignedReviewerId?: string | null;
    note?: string;
  },
) {
  return request<{ data: ReviewerCaseDetail }>(`/api/reviewer/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function sendReviewerMessage(id: string, body: string) {
  return request<{ data: ReviewerCaseDetail }>(`/api/reviewer/cases/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }).then((payload) => payload.data);
}

export async function requestEvidenceUploadToken(input: EvidenceUploadTokenInput) {
  const body = JSON.stringify({
    type: "blob.generate-client-token",
    payload: {
      pathname: input.pathname,
      clientPayload: JSON.stringify({
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
      }),
      multipart: input.multipart,
    },
  });

  const response = await fetch(`${API_BASE_URL}/api/cases/evidence/upload`, {
    method: "POST",
    credentials: "include",
    headers: toJsonHeaders(undefined, body),
    body,
  });
  const payload = await readJsonResponse<{
    clientToken?: string;
    error?: { code?: string; message?: string };
  }>(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? `Request failed with status ${response.status}.`,
      payload,
    );
  }

  if (!payload.clientToken) {
    throw new ApiError(
      500,
      "REQUEST_FAILED",
      "Missing evidence upload token.",
      payload,
    );
  }

  return payload.clientToken;
}

export async function registerReviewer(input: {
  name: string;
  email: string;
  department?: string;
}) {
  return request<{ data: ReviewerRegistrationResult }>("/api/reviewer/register", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function bootstrapGovernance(input: { email: string; password: string }) {
  return request<{ data: { authenticated: boolean; publicId: string } }>(
    "/api/governance/register",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ).then((payload) => payload.data);
}

export async function getGovernanceDashboard() {
  return request<{ data: GovernanceDashboard }>("/api/governance", {
    method: "GET",
  }).then((payload) => payload.data);
}

export async function createGovernanceTeam(input: {
  label: string;
  teamType: "committee" | "independent_oversight";
}) {
  return request<{ data: GovernanceCreateTeamResult }>("/api/governance/teams", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}

export async function deleteGovernanceTeam(teamId: string) {
  return request<{ data: { deleted: boolean } }>("/api/governance/teams", {
    method: "DELETE",
    body: JSON.stringify({ teamId }),
  }).then((payload) => payload.data);
}

export async function decideGovernanceRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  teamId?: string;
  slotNumber?: number;
}) {
  return request<{ data: GovernanceDecisionResult }>("/api/governance/registrations", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((payload) => payload.data);
}
