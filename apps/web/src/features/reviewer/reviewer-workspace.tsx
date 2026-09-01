"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/i18n/language-context";
import { GovernanceDashboard } from "./governance-dashboard";
import styles from "./reviewer-workspace.module.css";

type Reviewer = {
  id: string;
  displayName: string;
  publicId: string;
  role: "reviewer" | "administrator";
  routeScope: string;
  availability: "available" | "away" | "offline";
  teamId: string | null;
  teamPublicId: string | null;
  teamLabel: string | null;
  teamType: string | null;
  teamRole: "lead" | "member" | null;
};

type CaseListItem = {
  id: string;
  trackingCode: string;
  title: string;
  category: string;
  status: string;
  routeType: string;
  urgency: string;
  priority: number;
  evidenceCount: number;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  assignedReviewerPublicId?: string | null;
  teamPublicId?: string | null;
  teamLabel?: string | null;
  canReply?: boolean;
  createdAt: string;
  updatedAt: string;
};

type CaseSnapshot = {
  id: string;
  trackingCode: string;
  status: string;
  route: string;
  routeType: string;
  urgency: string;
  priority: number;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  assignedReviewerPublicId: string | null;
  assignedTeamPublicId: string | null;
  assignedTeamLabel: string | null;
  canReply: boolean;
  viewerTeamRole: "lead" | "member" | null;
  createdAt: string;
  updatedAt: string;
  report: {
    reporterRole: string;
    category: string;
    target: string;
    department: string;
    title: string;
    description: string;
    incidentDate: string;
    location: string;
  };
  messages: Array<{
    id: string;
    sender: string;
    senderPublicId: string | null;
    body: string;
    createdAt: string;
  }>;
  internalNotes: Array<{
    id: string;
    authorPublicId: string;
    body: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    status: string;
    actor: string;
    detail: string | null;
    createdAt: string;
  }>;
  evidence: Array<{
    id: string;
    name: string;
    contentType: string;
    byteSize: number;
    status: string;
    createdAt: string;
  }>;
};

type Metrics = {
  total: number;
  urgent: number;
  unassigned: number;
  awaitingReporter: number;
};
type ReviewerOption = Pick<
  Reviewer,
  "id" | "displayName" | "role" | "routeScope"
>;
type AuthMode = "reviewer" | "register" | "governance";

const emptyMetrics: Metrics = {
  total: 0,
  urgent: 0,
  unassigned: 0,
  awaitingReporter: 0,
};
const statusOptions = [
  ["received", "Received"],
  ["triage", "Triage"],
  ["under_review", "Under review"],
  ["awaiting_reporter", "Awaiting reporter"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReviewerWorkspace({
  initialAuthMode = "reviewer",
}: {
  initialAuthMode?: AuthMode;
}) {
  const { t } = useLanguage();
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode);
  const [governanceAction, setGovernanceAction] = useState<
    "login" | "register"
  >("login");
  const [registrationReceipt, setRegistrationReceipt] = useState("");
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseSnapshot | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [message, setMessage] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchCases = useCallback(async () => {
    setIsLoadingCases(true);
    setWorkspaceError("");
    const parameters = new URLSearchParams({
      query,
      status: statusFilter,
      assignment: assignmentFilter,
    });

    try {
      const response = await fetch(`/api/reviewer/cases?${parameters}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        setReviewer(null);
        return;
      }
      if (!response.ok)
        throw new Error(
          t(result.error?.message ?? "Cases could not be loaded."),
        );
      setCases(result.data.cases);
      setMetrics(result.data.metrics);
      setReviewer(result.data.reviewer);
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? t(error.message)
          : t("Cases could not be loaded."),
      );
    } finally {
      setIsLoadingCases(false);
    }
  }, [assignmentFilter, query, statusFilter, t]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/reviewer/session", {
          cache: "no-store",
        });
        if (response.ok) {
          const result = await response.json();
          setReviewer(result.data);
        }
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!reviewer || reviewer.role !== "reviewer") return;
    const timeout = window.setTimeout(() => void fetchCases(), 180);
    return () => window.clearTimeout(timeout);
  }, [fetchCases, reviewer]);

  useEffect(() => {
    if (!reviewer || reviewer.role !== "reviewer") return;
    void fetch("/api/reviewer/reviewers", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setReviewers(result.data ?? []));
  }, [reviewer]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/reviewer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password:
            authMode === "governance" && governanceAction === "login"
              ? form.get("password")
              : undefined,
          privateKey:
            authMode === "reviewer" ||
            (authMode === "governance" && governanceAction !== "login")
              ? form.get("privateKey")
              : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(t(result.error?.message ?? "Sign in failed."));
      const session = await fetch("/api/reviewer/session", {
        cache: "no-store",
      }).then((item) => item.json());
      setReviewer(session.data);
    } catch (error) {
      setLoginError(
        error instanceof Error ? t(error.message) : t("Sign in failed."),
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    setRegistrationReceipt("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/reviewer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          department: form.get("department") ?? "",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          t(result.error?.message ?? "Registration could not be submitted."),
        );
      setRegistrationReceipt(
        `${result.data.reviewerPublicId} · ${result.data.requestPublicId}`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? t(error.message)
          : t("Registration could not be submitted."),
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGovernanceRegistration = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/governance/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          t(result.error?.message ?? "Administrator registration failed."),
        );
      }
      const session = await fetch("/api/reviewer/session", {
        cache: "no-store",
      }).then((item) => item.json());
      setReviewer(session.data);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? t(error.message)
          : t("Administrator registration failed."),
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    await fetch("/api/reviewer/session", { method: "DELETE" });
    setReviewer(null);
    setCases([]);
    setSelectedCase(null);
  };

  const openCase = async (id: string) => {
    setWorkspaceError("");
    const response = await fetch(`/api/reviewer/cases/${id}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (response.ok) setSelectedCase(result.data);
    else
      setWorkspaceError(
        result.error?.message ?? "The case could not be opened.",
      );
  };

  const updateCase = async (changes: Record<string, unknown>) => {
    if (!selectedCase) return;
    setIsSaving(true);
    setWorkspaceError("");
    try {
      const response = await fetch(`/api/reviewer/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...changes, note: caseNote }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "The update could not be saved.",
        );
      setSelectedCase(result.data);
      setCaseNote("");
      await fetchCases();
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "The update could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase || message.trim().length < 2) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/reviewer/cases/${selectedCase.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: message }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Message could not be sent.");
      setSelectedCase(result.data);
      setMessage("");
      await fetchCases();
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Message could not be sent.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sendInternalNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase || internalNote.trim().length < 2) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/reviewer/cases/${selectedCase.id}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: internalNote }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "Internal note could not be saved.",
        );
      setSelectedCase({ ...selectedCase, internalNotes: result.data });
      setInternalNote("");
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Internal note could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const setAvailability = async (availability: Reviewer["availability"]) => {
    const response = await fetch("/api/reviewer/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability }),
    });
    if (response.ok && reviewer) setReviewer({ ...reviewer, availability });
  };

  const metricCards = useMemo(
    () => [
      ["Open queue", metrics.total, "Cases in the current view"],
      ["High attention", metrics.urgent, "Urgent or immediate"],
      ["Unassigned", metrics.unassigned, "Waiting for an owner"],
      ["Reporter reply", metrics.awaitingReporter, "Awaiting clarification"],
    ],
    [metrics],
  );

  if (checkingSession) {
    return (
      <div className={styles.loadingScreen}>
        {t("Opening restricted workspace…")}
      </div>
    );
  }

  if (!reviewer) {
    return (
      <main className={styles.loginPage}>
        <header className={styles.publicHeader}>
          <Link className="brand" href="/">
            <BrandIdentity />
          </Link>
          <div className={styles.publicHeaderActions}>
            <LanguageToggle />
            <Link href="/">{t("Return to public site")}</Link>
          </div>
        </header>
        <section className={styles.loginLayout}>
          <div className={styles.loginIntro}>
            <p>{t("Restricted operations")}</p>
            <h1>
              {t(
                "Review sensitive reports with a clear chain of responsibility.",
              )}
            </h1>
            <span>
              {t(
                "Access is limited by role and routing scope. Case views, downloads, replies, assignments, and status changes are security logged.",
              )}
            </span>
          </div>
          <form
            className={styles.loginCard}
            onSubmit={
              authMode === "register"
                ? handleRegistration
                : authMode === "governance" && governanceAction === "register"
                  ? handleGovernanceRegistration
                  : handleLogin
            }
          >
            <div className={styles.shieldMark}>S</div>
            <p>
              {t(
                authMode === "governance"
                  ? "Governance gateway"
                  : "Reviewer gateway",
              )}
            </p>
            <h2>
              {authMode === "register"
                ? t("Request approval for a reviewer team")
                : authMode === "governance"
                  ? t("Dean / VC governance access")
                  : t("Reviewer workspace sign in")}
            </h2>
            <div className={styles.authTabs}>
              <button
                className={authMode === "reviewer" ? styles.activeAuthTab : ""}
                onClick={() => {
                  setAuthMode("reviewer");
                  setLoginError("");
                }}
                type="button"
              >
                {t("Reviewer")}
              </button>
              <button
                className={authMode === "register" ? styles.activeAuthTab : ""}
                onClick={() => {
                  setAuthMode("register");
                  setLoginError("");
                }}
                type="button"
              >
                {t("Request access")}
              </button>
              <button
                className={
                  authMode === "governance" ? styles.activeAuthTab : ""
                }
                onClick={() => {
                  setAuthMode("governance");
                  setLoginError("");
                }}
                type="button"
              >
                {t("Dean / VC")}
              </button>
            </div>
            {authMode === "register" && (
              <div className={styles.flowNotice}>
                {t(
                  "Submit your details and wait for governance to assign one open SS private key and approve your reviewer access.",
                )}
              </div>
            )}
            {authMode === "governance" && (
              <div className={styles.flowNotice}>
                {t(
                  "Governance accounts can create teams and approve reviewer IDs. They cannot open reports, evidence, or anonymous conversations.",
                )}
              </div>
            )}
            {authMode === "governance" && (
              <div className={styles.governanceChoice}>
                <button
                  className={
                    governanceAction === "login" ? styles.activeAuthTab : ""
                  }
                  onClick={() => {
                    setGovernanceAction("login");
                    setLoginError("");
                  }}
                  type="button"
                >
                  {t("Sign in")}
                </button>
                <button
                  className={
                    governanceAction === "register" ? styles.activeAuthTab : ""
                  }
                  onClick={() => {
                    setGovernanceAction("register");
                    setLoginError("");
                  }}
                  type="button"
                >
                  {t("Register first admin")}
                </button>
              </div>
            )}
            <label>
              {authMode === "governance" && governanceAction === "register"
                ? t("Official email address")
                : t("Email address")}
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            {authMode === "register" && (
              <>
                <label>
                  {t("Full name")}
                  <input name="name" autoComplete="name" required />
                </label>
                <label>
                  {t("Department (optional)")}
                  <input name="department" autoComplete="organization" />
                </label>
              </>
            )}
            {(authMode === "governance" && governanceAction === "register") ||
            (authMode === "governance" && governanceAction === "login") ? (
              <label>
                {t("Password")}
                <input
                  name="password"
                  type="password"
                  minLength={
                    authMode === "governance" && governanceAction === "register"
                      ? 14
                      : undefined
                  }
                  autoComplete={
                    authMode === "governance" && governanceAction === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  required
                />
              </label>
            ) : null}
            {authMode === "reviewer" && (
              <label>
                {t("Private key")}
                <input
                  name="privateKey"
                  placeholder="SS-XXXX-XXXX"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            )}
            {loginError && (
              <div className={styles.errorBanner}>{loginError}</div>
            )}
            {registrationReceipt && (
              <div className={styles.successBanner}>
                <strong>{t("Sent to governance for approval")}</strong>
                <span>{registrationReceipt}</span>
                <small>
                  {t(
                    "A single governance approval is enough to activate the assigned private key.",
                  )}
                </small>
              </div>
            )}
            <button disabled={isLoggingIn} type="submit">
              {isLoggingIn
                ? t("Securing request…")
                : authMode === "register"
                  ? t("Send approval request")
                  : authMode === "governance"
                    ? governanceAction === "register"
                      ? t("Create administrator account")
                      : t("Open governance dashboard")
                    : t("Open reviewer workspace")}
            </button>
            <small>
              {authMode === "register"
                ? t(
                    "Governance sees only your pseudonymous reviewer ID and team slot—not your email.",
                  )
                : authMode === "governance" && governanceAction === "register"
                  ? t(
                      "Registration is available only until the first governance account is created.",
                    )
                  : t(
                      "Ten failed attempts temporarily lock this sign-in scope.",
                    )}
            </small>
            <Link className={styles.reporterAccess} href="/track">
              {t("Reporter / Victim access")}{" "}
              <span>{t("No account · tracking code + private key →")}</span>
            </Link>
          </form>
        </section>
      </main>
    );
  }

  if (reviewer.role === "administrator") {
    return <GovernanceDashboard identity={reviewer} onLogout={logout} />;
  }

  return (
    <main className={styles.workspace}>
      <aside className={styles.sidebar}>
        <Link className="brand" href="/">
          <BrandIdentity />
        </Link>
        <nav>
          <button className={styles.activeNav} type="button">
            <i /> {t("Case queue")}
          </button>
          <button type="button">
            <i /> {t("My assignments")}
          </button>
          <button type="button">
            <i /> {t("Audit activity")}
          </button>
        </nav>
        <div className={styles.scopeCard}>
          <span>{t("Protected team")}</span>
          <strong>{reviewer.teamLabel ?? t("Awaiting team activation")}</strong>
          <p>
            {reviewer.teamPublicId ?? t(label(reviewer.routeScope))} ·{" "}
            {reviewer.teamRole
              ? t(label(reviewer.teamRole))
              : t("No active seat")}
          </p>
        </div>
        <button className={styles.logoutButton} type="button" onClick={logout}>
          {t("Sign out")}
        </button>
      </aside>

      <section className={styles.dashboard}>
        <header className={styles.dashboardHeader}>
          <div>
            <p>{t("Operations / Case queue")}</p>
            <h1>
              {t("Good day,")} {reviewer.publicId}.
            </h1>
          </div>
          <div className={styles.dashboardActions}>
            <LanguageToggle />
            <label className={styles.availabilityControl}>
              {t("Status")}
              <select
                value={reviewer.availability}
                onChange={(event) =>
                  void setAvailability(
                    event.target.value as Reviewer["availability"],
                  )
                }
              >
                <option value="available">{t("Available")}</option>
                <option value="away">{t("Away")}</option>
                <option value="offline">{t("Offline")}</option>
              </select>
            </label>
            <div className={styles.reviewerBadge}>
              <span>R</span>
              <div>
                <strong>{reviewer.publicId}</strong>
                <small>
                  {t(
                    reviewer.teamRole === "lead"
                      ? "Lead Reviewer"
                      : "Review Team",
                  )}
                </small>
              </div>
            </div>
          </div>
        </header>

        <div className={styles.metricsGrid}>
          {metricCards.map(([title, value, description], index) => (
            <article
              style={{ animationDelay: `${index * 60}ms` }}
              key={String(title)}
            >
              <p>{t(String(title))}</p>
              <strong>{value}</strong>
              <span>{t(String(description))}</span>
            </article>
          ))}
        </div>

        <section className={styles.queueCard}>
          <div className={styles.queueHeading}>
            <div>
              <p>{t("Live workflow")}</p>
              <h2>{t("Case queue")}</h2>
            </div>
            <button type="button" onClick={() => void fetchCases()}>
              {t("Refresh")}
            </button>
          </div>
          <div className={styles.filters}>
            <input
              aria-label={t("Search by tracking code")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search tracking code…")}
              value={query}
            />
            <select
              aria-label={t("Filter by status")}
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="">{t("All statuses")}</option>
              {statusOptions.map(([value, title]) => (
                <option value={value} key={value}>
                  {t(title)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Filter by assignment")}
              onChange={(event) => setAssignmentFilter(event.target.value)}
              value={assignmentFilter}
            >
              <option value="">{t("All assignments")}</option>
              <option value="mine">{t("Assigned to me")}</option>
              <option value="unassigned">{t("Unassigned")}</option>
            </select>
          </div>
          {workspaceError && (
            <div className={styles.errorBanner}>{workspaceError}</div>
          )}
          <div className={styles.caseTable}>
            <div className={styles.tableHeader}>
              <span>{t("Case")}</span>
              <span>{t("Attention")}</span>
              <span>{t("Status")}</span>
              <span>{t("Owner")}</span>
              <span>{t("Updated")}</span>
            </div>
            {isLoadingCases ? (
              <div className={styles.emptyState}>
                {t("Refreshing protected case data…")}
              </div>
            ) : cases.length === 0 ? (
              <div className={styles.emptyState}>
                {t("No cases match this view.")}
              </div>
            ) : (
              cases.map((item) => (
                <button
                  className={styles.caseRow}
                  type="button"
                  key={item.id}
                  onClick={() => void openCase(item.id)}
                >
                  <span className={styles.caseTitle}>
                    <strong>{item.title}</strong>
                    <small>
                      {item.trackingCode} · {item.category}
                    </small>
                  </span>
                  <span>
                    <b className={`${styles.urgency} ${styles[item.urgency]}`}>
                      {t(label(item.urgency))}
                    </b>
                    <small>P{item.priority}</small>
                  </span>
                  <span>
                    <b className={styles.statusPill}>{t(label(item.status))}</b>
                    <small>
                      {item.evidenceCount} {t("evidence")}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {item.assignedReviewerName ?? t("Unassigned")}
                    </strong>
                    <small>{t(label(item.routeType))}</small>
                  </span>
                  <span>
                    <strong>{formatDate(item.updatedAt)}</strong>
                    <small>{t("Open case →")}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </section>

      {selectedCase && (
        <div
          className={styles.caseOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("Case workspace")}
        >
          <div className={styles.caseDrawer}>
            <header className={styles.drawerHeader}>
              <div>
                <p>{selectedCase.trackingCode}</p>
                <h2>{selectedCase.report.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                aria-label={t("Close case")}
              >
                ×
              </button>
            </header>
            <div className={styles.drawerBody}>
              <div className={styles.caseContent}>
                <div className={styles.caseMeta}>
                  <span>{selectedCase.report.category}</span>
                  <span>{label(selectedCase.urgency)}</span>
                  <span>{selectedCase.route}</span>
                </div>
                <article className={styles.narrativeCard}>
                  <p>{t("Detailed account")}</p>
                  <h3>{selectedCase.report.title}</h3>
                  <div>{selectedCase.report.description}</div>
                  <dl>
                    <div>
                      <dt>{t("Perspective")}</dt>
                      <dd>{t(label(selectedCase.report.reporterRole))}</dd>
                    </div>
                    <div>
                      <dt>{t("Target")}</dt>
                      <dd>{t(label(selectedCase.report.target))}</dd>
                    </div>
                    <div>
                      <dt>{t("Incident date")}</dt>
                      <dd>
                        {selectedCase.report.incidentDate || t("Not supplied")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Location")}</dt>
                      <dd>
                        {selectedCase.report.location || t("Not supplied")}
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className={styles.evidenceCard}>
                  <div>
                    <p>{t("Protected evidence")}</p>
                    <h3>
                      {selectedCase.evidence.length} {t("file(s)")}
                    </h3>
                  </div>
                  {selectedCase.evidence.length === 0 ? (
                    <span>{t("No evidence attached.")}</span>
                  ) : (
                    selectedCase.evidence.map((file) => (
                      <a href={`/api/cases/evidence/${file.id}`} key={file.id}>
                        <span className={styles.fileMark}>FILE</span>
                        <div>
                          <strong>{file.name}</strong>
                          <small>
                            {formatBytes(file.byteSize)} ·{" "}
                            {t(label(file.status))}
                          </small>
                        </div>
                        <b>{t("Download")}</b>
                      </a>
                    ))
                  )}
                </article>

                <article className={styles.threadCard}>
                  <div>
                    <p>{t("Anonymous correspondence")}</p>
                    <h3>{t("Reporter conversation")}</h3>
                  </div>
                  <div className={styles.messages}>
                    {selectedCase.messages.length === 0 ? (
                      <span>{t("No messages yet.")}</span>
                    ) : (
                      selectedCase.messages.map((item) => (
                        <div
                          className={
                            item.sender === "reviewer"
                              ? styles.reviewerMessage
                              : styles.reporterMessage
                          }
                          key={item.id}
                        >
                          <strong>
                            {item.sender === "reviewer"
                              ? (item.senderPublicId ?? t("Review team"))
                              : `${t("Anonymous reporter")} · RPT-PRIVATE`}
                          </strong>
                          <p>{item.body}</p>
                          <small>{formatDate(item.createdAt)}</small>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedCase.canReply ? (
                    <form
                      onSubmit={sendMessage}
                      className={styles.messageComposer}
                    >
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        maxLength={4000}
                        placeholder={t(
                          "Ask for clarification without requesting identity details…",
                        )}
                      />
                      <button
                        disabled={isSaving || message.trim().length < 2}
                        type="submit"
                      >
                        {t("Send as Lead Reviewer")}
                      </button>
                    </form>
                  ) : (
                    <div className={styles.leadLock}>
                      <span>{t("Lead-only channel")}</span>
                      <p>
                        {t("You can read the complete anonymous thread. Only")}{" "}
                        {selectedCase.assignedReviewerPublicId ??
                          t("the assigned Lead Reviewer")}{" "}
                        {t("can send the official reply.")}
                      </p>
                    </div>
                  )}
                </article>

                <article className={styles.internalNotesCard}>
                  <div>
                    <p>{t("Team-only collaboration")}</p>
                    <h3>{t("Internal notes")}</h3>
                    <span>
                      {t(
                        "Never visible to the anonymous reporter or governance accounts.",
                      )}
                    </span>
                  </div>
                  <div className={styles.internalNotes}>
                    {selectedCase.internalNotes.length === 0 ? (
                      <span>{t("No internal notes yet.")}</span>
                    ) : (
                      selectedCase.internalNotes.map((note) => (
                        <div key={note.id}>
                          <strong>{note.authorPublicId}</strong>
                          <p>{note.body}</p>
                          <small>{formatDate(note.createdAt)}</small>
                        </div>
                      ))
                    )}
                  </div>
                  <form
                    onSubmit={sendInternalNote}
                    className={styles.messageComposer}
                  >
                    <textarea
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                      maxLength={4000}
                      placeholder={t("Add a team-only analysis note…")}
                    />
                    <button
                      disabled={isSaving || internalNote.trim().length < 2}
                      type="submit"
                    >
                      {t("Save internal note")}
                    </button>
                  </form>
                </article>
              </div>

              <aside className={styles.caseControls}>
                <div className={styles.controlCard}>
                  <p>{t("Workflow control")}</p>
                  <label>
                    {t("Status")}
                    <select
                      value={selectedCase.status}
                      onChange={(event) =>
                        void updateCase({ status: event.target.value })
                      }
                      disabled={isSaving}
                    >
                      {statusOptions.map(([value, title]) => (
                        <option value={value} key={value}>
                          {t(title)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Priority")}
                    <select
                      value={selectedCase.priority}
                      onChange={(event) =>
                        void updateCase({
                          priority: Number(event.target.value),
                        })
                      }
                      disabled={isSaving}
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option value={value} key={value}>
                          P{value} ·{" "}
                          {t(
                            value === 4
                              ? "Critical"
                              : value === 3
                                ? "High"
                                : value === 2
                                  ? "Normal"
                                  : "Low",
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Lead Reviewer")}
                    <select
                      value={selectedCase.assignedReviewerId ?? ""}
                      onChange={(event) =>
                        void updateCase({
                          assignedReviewerId: event.target.value || null,
                        })
                      }
                      disabled={isSaving}
                    >
                      <option value="">{t("Unassigned")}</option>
                      {reviewers.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Public update note")}
                    <textarea
                      value={caseNote}
                      onChange={(event) => setCaseNote(event.target.value)}
                      placeholder={t(
                        "Optional note shown in the reporter timeline",
                      )}
                      maxLength={1000}
                    />
                  </label>
                  <small>
                    {t(
                      "Changes are immediately logged and reflected in the reporter workspace.",
                    )}
                  </small>
                </div>
                <div className={styles.timelineCard}>
                  <p>{t("Case history")}</p>
                  {selectedCase.events.map((event) => (
                    <div key={event.id}>
                      <i />
                      <span>
                        <strong>{t(label(event.type))}</strong>
                        <small>
                          {event.detail || t(label(event.status))} ·{" "}
                          {formatDate(event.createdAt)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
