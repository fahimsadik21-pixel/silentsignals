"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import styles from "./reviewer-workspace.module.css";

type Reviewer = {
  id: string;
  email: string;
  displayName: string;
  role: "reviewer" | "administrator";
  routeScope: string;
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
  messages: Array<{ id: string; sender: string; body: string; createdAt: string }>;
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

type Metrics = { total: number; urgent: number; unassigned: number; awaitingReporter: number };
type ReviewerOption = Pick<Reviewer, "id" | "displayName" | "role" | "routeScope">;

const emptyMetrics: Metrics = { total: 0, urgent: 0, unassigned: 0, awaitingReporter: 0 };
const statusOptions = [
  ["received", "Received"],
  ["triage", "Triage"],
  ["under_review", "Under review"],
  ["awaiting_reporter", "Awaiting reporter"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReviewerWorkspace() {
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
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
  const [isSaving, setIsSaving] = useState(false);

  const fetchCases = useCallback(async () => {
    setIsLoadingCases(true);
    setWorkspaceError("");
    const parameters = new URLSearchParams({ query, status: statusFilter, assignment: assignmentFilter });

    try {
      const response = await fetch(`/api/reviewer/cases?${parameters}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        setReviewer(null);
        return;
      }
      if (!response.ok) throw new Error(result.error?.message ?? "Cases could not be loaded.");
      setCases(result.data.cases);
      setMetrics(result.data.metrics);
      setReviewer(result.data.reviewer);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Cases could not be loaded.");
    } finally {
      setIsLoadingCases(false);
    }
  }, [assignmentFilter, query, statusFilter]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/reviewer/session", { cache: "no-store" });
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
    if (!reviewer) return;
    const timeout = window.setTimeout(() => void fetchCases(), 180);
    return () => window.clearTimeout(timeout);
  }, [fetchCases, reviewer]);

  useEffect(() => {
    if (!reviewer) return;
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
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Sign in failed.");
      const session = await fetch("/api/reviewer/session", { cache: "no-store" }).then((item) =>
        item.json(),
      );
      setReviewer(session.data);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed.");
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
    const response = await fetch(`/api/reviewer/cases/${id}`, { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setSelectedCase(result.data);
    else setWorkspaceError(result.error?.message ?? "The case could not be opened.");
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
      if (!response.ok) throw new Error(result.error?.message ?? "The update could not be saved.");
      setSelectedCase(result.data);
      setCaseNote("");
      await fetchCases();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "The update could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase || message.trim().length < 2) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/reviewer/cases/${selectedCase.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Message could not be sent.");
      setSelectedCase(result.data);
      setMessage("");
      await fetchCases();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setIsSaving(false);
    }
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
    return <div className={styles.loadingScreen}>Opening restricted workspace…</div>;
  }

  if (!reviewer) {
    return (
      <main className={styles.loginPage}>
        <header className={styles.publicHeader}>
          <Link className="brand" href="/">
            <BrandIdentity />
          </Link>
          <Link href="/">Return to public site</Link>
        </header>
        <section className={styles.loginLayout}>
          <div className={styles.loginIntro}>
            <p>Restricted operations</p>
            <h1>Review sensitive reports with a clear chain of responsibility.</h1>
            <span>
              Access is limited by role and routing scope. Case views, downloads, replies,
              assignments, and status changes are security logged.
            </span>
          </div>
          <form className={styles.loginCard} onSubmit={handleLogin}>
            <div className={styles.shieldMark}>S</div>
            <p>Reviewer gateway</p>
            <h2>Sign in to the case workspace</h2>
            <label>
              Institutional email
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {loginError && <div className={styles.errorBanner}>{loginError}</div>}
            <button disabled={isLoggingIn} type="submit">
              {isLoggingIn ? "Verifying access…" : "Enter restricted workspace"}
            </button>
            <small>Ten failed attempts temporarily lock this sign-in scope.</small>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      <aside className={styles.sidebar}>
        <Link className="brand" href="/">
          <BrandIdentity />
        </Link>
        <nav>
          <button className={styles.activeNav} type="button"><i /> Case queue</button>
          <button type="button"><i /> My assignments</button>
          <button type="button"><i /> Audit activity</button>
        </nav>
        <div className={styles.scopeCard}>
          <span>Access scope</span>
          <strong>{label(reviewer.routeScope)}</strong>
          <p>Server-enforced on every case request.</p>
        </div>
        <button className={styles.logoutButton} type="button" onClick={logout}>Sign out</button>
      </aside>

      <section className={styles.dashboard}>
        <header className={styles.dashboardHeader}>
          <div>
            <p>Operations / Case queue</p>
            <h1>Good day, {reviewer.displayName.split(" ")[0]}.</h1>
          </div>
          <div className={styles.reviewerBadge}>
            <span>{reviewer.displayName.slice(0, 1).toUpperCase()}</span>
            <div><strong>{reviewer.displayName}</strong><small>{label(reviewer.role)}</small></div>
          </div>
        </header>

        <div className={styles.metricsGrid}>
          {metricCards.map(([title, value, description], index) => (
            <article style={{ animationDelay: `${index * 60}ms` }} key={String(title)}>
              <p>{title}</p><strong>{value}</strong><span>{description}</span>
            </article>
          ))}
        </div>

        <section className={styles.queueCard}>
          <div className={styles.queueHeading}>
            <div><p>Live workflow</p><h2>Case queue</h2></div>
            <button type="button" onClick={() => void fetchCases()}>Refresh</button>
          </div>
          <div className={styles.filters}>
            <input
              aria-label="Search by tracking code"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tracking code…"
              value={query}
            />
            <select aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">All statuses</option>
              {statusOptions.map(([value, title]) => <option value={value} key={value}>{title}</option>)}
            </select>
            <select aria-label="Filter by assignment" onChange={(event) => setAssignmentFilter(event.target.value)} value={assignmentFilter}>
              <option value="">All assignments</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option>
            </select>
          </div>
          {workspaceError && <div className={styles.errorBanner}>{workspaceError}</div>}
          <div className={styles.caseTable}>
            <div className={styles.tableHeader}><span>Case</span><span>Attention</span><span>Status</span><span>Owner</span><span>Updated</span></div>
            {isLoadingCases ? (
              <div className={styles.emptyState}>Refreshing protected case data…</div>
            ) : cases.length === 0 ? (
              <div className={styles.emptyState}>No cases match this view.</div>
            ) : cases.map((item) => (
              <button className={styles.caseRow} type="button" key={item.id} onClick={() => void openCase(item.id)}>
                <span className={styles.caseTitle}><strong>{item.title}</strong><small>{item.trackingCode} · {item.category}</small></span>
                <span><b className={`${styles.urgency} ${styles[item.urgency]}`}>{label(item.urgency)}</b><small>P{item.priority}</small></span>
                <span><b className={styles.statusPill}>{label(item.status)}</b><small>{item.evidenceCount} evidence</small></span>
                <span><strong>{item.assignedReviewerName ?? "Unassigned"}</strong><small>{label(item.routeType)}</small></span>
                <span><strong>{formatDate(item.updatedAt)}</strong><small>Open case →</small></span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {selectedCase && (
        <div className={styles.caseOverlay} role="dialog" aria-modal="true" aria-label="Case workspace">
          <div className={styles.caseDrawer}>
            <header className={styles.drawerHeader}>
              <div><p>{selectedCase.trackingCode}</p><h2>{selectedCase.report.title}</h2></div>
              <button type="button" onClick={() => setSelectedCase(null)} aria-label="Close case">×</button>
            </header>
            <div className={styles.drawerBody}>
              <div className={styles.caseContent}>
                <div className={styles.caseMeta}>
                  <span>{selectedCase.report.category}</span><span>{label(selectedCase.urgency)}</span><span>{selectedCase.route}</span>
                </div>
                <article className={styles.narrativeCard}>
                  <p>Detailed account</p><h3>{selectedCase.report.title}</h3><div>{selectedCase.report.description}</div>
                  <dl>
                    <div><dt>Perspective</dt><dd>{label(selectedCase.report.reporterRole)}</dd></div>
                    <div><dt>Target</dt><dd>{label(selectedCase.report.target)}</dd></div>
                    <div><dt>Incident date</dt><dd>{selectedCase.report.incidentDate || "Not supplied"}</dd></div>
                    <div><dt>Location</dt><dd>{selectedCase.report.location || "Not supplied"}</dd></div>
                  </dl>
                </article>

                <article className={styles.evidenceCard}>
                  <div><p>Protected evidence</p><h3>{selectedCase.evidence.length} file(s)</h3></div>
                  {selectedCase.evidence.length === 0 ? <span>No evidence attached.</span> : selectedCase.evidence.map((file) => (
                    <a href={`/api/cases/evidence/${file.id}`} key={file.id}>
                      <span className={styles.fileMark}>FILE</span><div><strong>{file.name}</strong><small>{formatBytes(file.byteSize)} · {label(file.status)}</small></div><b>Download</b>
                    </a>
                  ))}
                </article>

                <article className={styles.threadCard}>
                  <div><p>Anonymous correspondence</p><h3>Reporter conversation</h3></div>
                  <div className={styles.messages}>
                    {selectedCase.messages.length === 0 ? <span>No messages yet.</span> : selectedCase.messages.map((item) => (
                      <div className={item.sender === "reviewer" ? styles.reviewerMessage : styles.reporterMessage} key={item.id}>
                        <strong>{item.sender === "reviewer" ? "Review team" : "Anonymous reporter"}</strong><p>{item.body}</p><small>{formatDate(item.createdAt)}</small>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} className={styles.messageComposer}>
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} placeholder="Ask for clarification without requesting identity details…" />
                    <button disabled={isSaving || message.trim().length < 2} type="submit">Send secure reply</button>
                  </form>
                </article>
              </div>

              <aside className={styles.caseControls}>
                <div className={styles.controlCard}>
                  <p>Workflow control</p>
                  <label>Status<select value={selectedCase.status} onChange={(event) => void updateCase({ status: event.target.value })} disabled={isSaving}>{statusOptions.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></label>
                  <label>Priority<select value={selectedCase.priority} onChange={(event) => void updateCase({ priority: Number(event.target.value) })} disabled={isSaving}>{[1,2,3,4].map((value) => <option value={value} key={value}>P{value} · {value === 4 ? "Critical" : value === 3 ? "High" : value === 2 ? "Normal" : "Low"}</option>)}</select></label>
                  <label>Assigned reviewer<select value={selectedCase.assignedReviewerId ?? ""} onChange={(event) => void updateCase({ assignedReviewerId: event.target.value || null })} disabled={isSaving}><option value="">Unassigned</option>{reviewers.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label>
                  <label>Public update note<textarea value={caseNote} onChange={(event) => setCaseNote(event.target.value)} placeholder="Optional note shown in the reporter timeline" maxLength={1000} /></label>
                  <small>Changes are immediately logged and reflected in the reporter workspace.</small>
                </div>
                <div className={styles.timelineCard}>
                  <p>Case history</p>
                  {selectedCase.events.map((event) => <div key={event.id}><i /><span><strong>{label(event.type)}</strong><small>{event.detail || label(event.status)} · {formatDate(event.createdAt)}</small></span></div>)}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
