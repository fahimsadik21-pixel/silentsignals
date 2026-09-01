"use client";

import Link from "next/link";
import { upload } from "@vercel/blob/client";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/i18n/language-context";
import { openPreviewCase, type PreviewCase } from "@/lib/preview-case-store";
import styles from "./case-access.module.css";

const credentialAlphabet = /^[A-HJ-NP-Z2-9]+$/;

type OpenedCase = {
  trackingCode: string;
  status: string;
  route: string;
  category: string;
  urgency: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  evidenceCount: number;
  source: "encrypted_preview" | "database";
  messages: CaseMessage[];
  events: CaseEvent[];
  evidence: CaseEvidence[];
};

type CaseMessage = { id: string; sender: string; senderPublicId?: string | null; body: string; createdAt: string };
type CaseEvent = {
  id: string;
  type: string;
  status: string;
  actor: string;
  detail: string | null;
  createdAt: string;
};
type CaseEvidence = {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  status: string;
  createdAt: string;
};

type AccessResponse = {
  data?: Omit<OpenedCase, "trackingCode" | "source" | "evidenceCount"> & {
    evidenceCount?: number;
  };
  error?: { code?: string; message?: string };
};

type SnapshotResponse = {
  data?: {
    trackingCode: string;
    status: string;
    route: string;
    urgency: string;
    createdAt: string;
    updatedAt: string;
    evidenceCount: number;
    report: { category: string; title: string; description: string };
    messages: CaseMessage[];
    events: CaseEvent[];
    evidence: CaseEvidence[];
  };
  error?: { message?: string };
};

const progressSteps = ["Received", "Triage", "Under review", "Resolution"];

function formatTrackingCode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15);

  if (!clean) return "";

  const prefix = clean.slice(0, 3);
  const year = clean.slice(3, 7);
  const first = clean.slice(7, 11);
  const second = clean.slice(11, 15);

  return [prefix, year, first, second].filter(Boolean).join("-");
}

function formatAccessKey(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return clean.match(/.{1,4}/g)?.join(" ") ?? "";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function previewToOpenedCase(preview: PreviewCase): OpenedCase {
  return {
    trackingCode: preview.trackingCode,
    status: preview.status,
    route: preview.route,
    category: preview.category,
    urgency: preview.urgency,
    title: preview.title,
    description: preview.description,
    createdAt: preview.createdAt,
    updatedAt: preview.updatedAt,
    evidenceCount: preview.evidenceCount,
    source: "encrypted_preview",
    messages: [],
    events: [],
    evidence: [],
  };
}

function snapshotToOpenedCase(snapshot: NonNullable<SnapshotResponse["data"]>): OpenedCase {
  return {
    trackingCode: snapshot.trackingCode,
    status: snapshot.status,
    route: snapshot.route,
    category: snapshot.report.category,
    urgency: snapshot.urgency,
    title: snapshot.report.title,
    description: snapshot.report.description,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    evidenceCount: snapshot.evidenceCount,
    source: "database",
    messages: snapshot.messages,
    events: snapshot.events,
    evidence: snapshot.evidence,
  };
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function evidenceContentType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    txt: "text/plain", mp3: "audio/mpeg", m4a: "audio/x-m4a", wav: "audio/wav",
    mp4: "video/mp4", webm: "video/webm",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

export function CaseAccess() {
  const { t } = useLanguage();
  const [trackingCode, setTrackingCode] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [openedCase, setOpenedCase] = useState<OpenedCase | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [evidenceProgress, setEvidenceProgress] = useState("");

  const trackingParts = trackingCode.split("-");
  const trackingValid =
    trackingParts.length === 4 &&
    trackingParts[0] === "SIG" &&
    /^\d{4}$/.test(trackingParts[1] ?? "") &&
    credentialAlphabet.test(trackingParts[2] ?? "") &&
    credentialAlphabet.test(trackingParts[3] ?? "") &&
    trackingParts[2]?.length === 4 &&
    trackingParts[3]?.length === 4;
  const keyClean = accessKey.replaceAll(" ", "");
  const accessKeyValid = keyClean.length === 16 && credentialAlphabet.test(keyClean);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setAccessError("");

    if (!trackingValid || !accessKeyValid) return;

    setIsOpening(true);

    try {
      const localCase = await openPreviewCase(trackingCode, accessKey);

      if (localCase) {
        setOpenedCase(previewToOpenedCase(localCase));
        setAccessKey("");
        return;
      }

      const response = await fetch("/api/cases/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode, accessKey }),
      });
      const result = (await response.json()) as AccessResponse;

      if (response.ok && result.data) {
        setOpenedCase({
          ...result.data,
          trackingCode,
          evidenceCount: result.data.evidenceCount ?? 0,
          source: "database",
        });
        setAccessKey("");
        return;
      }

      if (response.status === 429) {
        setAccessError(t(result.error?.message ?? "Too many attempts. Try again later."));
      } else if (response.status === 503) {
        setAccessError(
          t("No encrypted preview matches these credentials in this browser. Older preview receipts were not stored; create one new report, then use its new credentials here."),
        );
      } else {
        setAccessError(t("The tracking code and private access key do not match a case."));
      }
    } catch {
      setAccessError(
        t("No encrypted preview matches these credentials in this browser, and the secure database is currently unavailable."),
      );
    } finally {
      setIsOpening(false);
    }
  };

  const lockCase = () => {
    setOpenedCase(null);
    setTrackingCode("");
    setAccessKey("");
    setAttempted(false);
    setAccessError("");
    setCopied(false);
    setMessage("");
    setWorkspaceError("");
    setEvidenceProgress("");
  };

  const copyTrackingCode = async () => {
    if (!openedCase) return;

    await navigator.clipboard.writeText(openedCase.trackingCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const refreshDatabaseCase = async () => {
    const response = await fetch("/api/cases/current", { cache: "no-store" });
    const result = (await response.json()) as SnapshotResponse;
    if (!response.ok || !result.data) {
      throw new Error(t(result.error?.message ?? "Open the case again to continue."));
    }
    setOpenedCase(snapshotToOpenedCase(result.data));
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!openedCase || openedCase.source !== "database" || message.trim().length < 2) return;
    setIsSending(true);
    setWorkspaceError("");

    try {
      const response = await fetch("/api/cases/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
      const result = (await response.json()) as SnapshotResponse;
      if (!response.ok || !result.data) {
        throw new Error(t(result.error?.message ?? "The message could not be sent."));
      }
      setOpenedCase(snapshotToOpenedCase(result.data));
      setMessage("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? t(error.message) : t("The message could not be sent."));
    } finally {
      setIsSending(false);
    }
  };

  const addEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!openedCase || openedCase.source !== "database") return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (openedCase.evidenceCount + files.length > 5) {
      setWorkspaceError(t("A case can contain up to five evidence files."));
      return;
    }

    setWorkspaceError("");
    setEvidenceProgress(`Uploading 0 of ${files.length}…`);
    const results = await Promise.allSettled(
      files.map(async (file, index) => {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
        const contentType = evidenceContentType(file);
        return upload(`evidence/${crypto.randomUUID()}`, file, {
          access: "private",
          handleUploadUrl: "/api/cases/evidence/upload",
          multipart: file.size > 4 * 1024 * 1024,
          contentType,
          clientPayload: JSON.stringify({ fileName: file.name, contentType, byteSize: file.size }),
          onUploadProgress: ({ percentage }) =>
            setEvidenceProgress(
              `Protecting file ${index + 1} of ${files.length} · ${Math.round(percentage)}%`,
            ),
        });
      }),
    );
    const failed = results.filter((result) => result.status === "rejected").length;

    try {
      await refreshDatabaseCase();
      if (failed > 0) setWorkspaceError(`${failed} evidence file(s) could not be uploaded.`);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? t(error.message) : t("Evidence status could not refresh."));
    } finally {
      setEvidenceProgress("");
    }
  };

  if (openedCase) {
    const statusIndex =
      openedCase.status === "resolved" || openedCase.status === "closed"
        ? 3
        : openedCase.status === "under_review" || openedCase.status === "awaiting_reporter"
          ? 2
          : openedCase.status === "triage"
            ? 1
            : 0;

    return (
      <main className={styles.page}>
        <CaseHeader actionLabel={t("Lock case")} onAction={lockCase} />

        <section className={styles.workspaceLayout}>
          <div className={styles.workspaceHeading}>
            <div>
              <p className={styles.eyebrow}>{t("Private case workspace")}</p>
              <h1>{openedCase.title}</h1>
            </div>
            <div className={styles.workspaceStatus}>
              <span aria-hidden="true" />
              {t(titleCase(openedCase.status))}
            </div>
          </div>

          <div className={styles.workspaceGrid}>
            <div className={styles.workspaceMain}>
              <article className={styles.statusCard}>
                <div className={styles.cardTopline}>
                  <div>
                    <p>{t("Case progress")}</p>
                    <h2>{t("Current status:")} {t(titleCase(openedCase.status))}</h2>
                  </div>
                  <span>{t("Updated")} {formatDate(openedCase.updatedAt)}</span>
                </div>
                <ol className={styles.caseProgress}>
                  {progressSteps.map((step, index) => (
                    <li className={index <= statusIndex ? styles.completedProgress : ""} key={step}>
                      <span>{index < statusIndex ? "✓" : `0${index + 1}`}</span>
                      <strong>{t(step)}</strong>
                    </li>
                  ))}
                </ol>
                <div className={styles.statusMessage}>
                  <span aria-hidden="true">i</span>
                  <p>
                    <strong>{t(titleCase(openedCase.status))}</strong>
                    {openedCase.events.at(-1)?.detail ??
                      t("Every status change and reviewer update will appear in this private workspace.")}
                  </p>
                </div>
                {openedCase.events.length > 0 && (
                  <div className={styles.caseTimeline}>
                    {openedCase.events.map((event) => (
                      <div key={event.id}>
                        <i aria-hidden="true" />
                        <p>
                          <strong>{t(titleCase(event.type))}</strong>
                          <span>{event.detail ?? t(titleCase(event.status))}</span>
                          <small>{formatDate(event.createdAt)}</small>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className={styles.summaryCard}>
                <div className={styles.cardTopline}>
                  <div>
                    <p>{t("Submitted report")}</p>
                    <h2>{t("Case summary")}</h2>
                  </div>
                  <span>{formatDate(openedCase.createdAt)}</span>
                </div>
                <dl className={styles.caseFacts}>
                  <div>
                    <dt>{t("Category")}</dt>
                    <dd>{openedCase.category}</dd>
                  </div>
                  <div>
                    <dt>{t("Urgency")}</dt>
                    <dd>{t(titleCase(openedCase.urgency))}</dd>
                  </div>
                  <div>
                    <dt>{t("Routing")}</dt>
                    <dd>{openedCase.route}</dd>
                  </div>
                  <div>
                    <dt>{t("Evidence")}</dt>
                    <dd>{openedCase.evidenceCount} {t("protected file(s)")}</dd>
                  </div>
                </dl>
                {openedCase.description && (
                  <div className={styles.caseNarrative}>
                    <span>{t("Detailed account")}</span>
                    <p>{openedCase.description}</p>
                  </div>
                )}
                {openedCase.source === "database" && (
                  <div className={styles.reporterEvidence}>
                    <div>
                      <strong>{t("Protected evidence")}</strong>
                      <span>{evidenceProgress || t("Private files remain restricted to this case.")}</span>
                    </div>
                    <label>
                      {t("Add evidence")}
                      <input
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.mp3,.m4a,.wav,.mp4,.webm"
                        multiple
                        onChange={addEvidence}
                        type="file"
                      />
                    </label>
                    {openedCase.evidence.map((file) => (
                      <a href={`/api/cases/evidence/${file.id}`} key={file.id}>
                        <span>{file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span>
                        <p><strong>{file.name}</strong><small>{formatBytes(file.byteSize)} · {titleCase(file.status)}</small></p>
                        <b>{t("Download")}</b>
                      </a>
                    ))}
                  </div>
                )}
              </article>

              <article className={styles.messageCard} id="anonymous-chat">
                <div className={styles.messageWorkspace}>
                  <p>{t("Anonymous victim ↔ Lead Reviewer chat")}</p>
                  <h2>
                    {openedCase.messages.length > 0
                      ? t("Private case conversation")
                      : openedCase.source === "database"
                        ? t("Start an anonymous conversation")
                        : t("This is a legacy browser-only receipt")}
                  </h2>
                  <div className={styles.messageThread}>
                    {openedCase.messages.map((item) => (
                      <div
                        className={item.sender === "reporter" ? styles.reporterBubble : styles.reviewerBubble}
                        key={item.id}
                      >
                        <strong>{item.sender === "reporter" ? t("You") : `${t("Lead Reviewer")} · ${item.senderPublicId ?? "REV-PRIVATE"}`}</strong>
                        <span>{item.body}</span>
                        <small>{formatDate(item.createdAt)}</small>
                      </div>
                    ))}
                  </div>
                  {openedCase.source === "database" ? (
                    <form className={styles.replyForm} onSubmit={sendMessage}>
                      <textarea
                        maxLength={4000}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder={t("Reply without including identity details…")}
                        value={message}
                      />
                      <button disabled={isSending || message.trim().length < 2} type="submit">
                        {t(isSending ? "Sending…" : "Send private reply")}
                      </button>
                    </form>
                  ) : (
                    <div className={styles.workspaceError}>
                      {t("This older preview was never stored on the server, so it cannot support chat. Submit one new report to receive database-backed credentials and anonymous messaging.")}
                      <div><Link href="/report">{t("Submit a new secure report →")}</Link></div>
                    </div>
                  )}
                  {workspaceError && <div className={styles.workspaceError}>{workspaceError}</div>}
                </div>
              </article>
            </div>

            <aside className={styles.caseSidebar}>
              <div className={styles.caseIdentityCard}>
                <p>{t("Case reference")}</p>
                <strong>{openedCase.trackingCode}</strong>
                <button type="button" onClick={copyTrackingCode}>
                  {t(copied ? "Copied" : "Copy tracking code")}
                </button>
              </div>

              <div className={styles.routeCard}>
                <p>{t("Assigned route")}</p>
                <strong>{openedCase.route}</strong>
                <span>
                  {t("Access is limited to reviewers authorized for this routing level.")}
                </span>
              </div>

              {openedCase.source === "database" && (
                <a className={styles.chatShortcut} href="#anonymous-chat">
                  {t("Open anonymous chat")} <span>{t("Victim ↔ Lead Reviewer →")}</span>
                </a>
              )}

              <div className={styles.previewModeCard}>
                <span aria-hidden="true">{openedCase.source === "encrypted_preview" ? "L" : "D"}</span>
                <div>
                  <strong>
                    {openedCase.source === "encrypted_preview"
                      ? t("Encrypted local preview")
                      : t("Secure database case")}
                  </strong>
                  <p>
                    {openedCase.source === "encrypted_preview"
                      ? t("This case exists only in this browser and is protected by the private access key.")
                      : t("This case was verified by the server-side credential service.")}
                  </p>
                </div>
              </div>

              <button className={styles.lockButton} type="button" onClick={lockCase}>
                {t("Lock and leave case")}
              </button>
            </aside>
          </div>
        </section>

        <CaseFooter />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <CaseHeader />

      <section className={styles.accessLayout}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t("Private case access")}</p>
          <h1>{t("Return to your case without revealing who you are.")}</h1>
          <p className={styles.summary}>
            {t("Your tracking code finds the case. Your private access key proves you are the reporter. Neither credential contains your name or account information.")}
          </p>

          <div className={styles.privacyList}>
            <div>
              <span>01</span>
              <p>
                <strong>{t("No account login")}</strong>
                {t("No email address, password reset, or identity profile.")}
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>{t("Two-part access")}</strong>
                {t("A tracking code alone cannot open a private case.")}
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>{t("Restricted attempts")}</strong>
                {t("Production access is rate-limited and security logged.")}
              </p>
            </div>
          </div>
        </div>

        <div className={styles.accessColumn}>
          <form className={styles.accessCard} onSubmit={handleSubmit} noValidate>
            <div className={styles.cardHeading}>
              <div className={styles.lockMark} aria-hidden="true">
                <span />
              </div>
              <div>
                <p>{t("Secure gateway")}</p>
                <h2>{t("Open a private case")}</h2>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="tracking-code">{t("Tracking code")}</label>
                <span>{t("Shown on your receipt")}</span>
              </div>
              <input
                aria-describedby="tracking-hint tracking-error"
                aria-invalid={attempted && !trackingValid}
                autoCapitalize="characters"
                autoComplete="off"
                id="tracking-code"
                inputMode="text"
                onChange={(event) => {
                  setTrackingCode(formatTrackingCode(event.target.value));
                  setAccessError("");
                }}
                placeholder="SIG-2026-A7K2-9M4Q"
                spellCheck={false}
                value={trackingCode}
              />
              <p className={styles.fieldHint} id="tracking-hint">
                {t("Format: SIG–YEAR–XXXX–XXXX")}
              </p>
              {attempted && !trackingValid && (
                <p className={styles.errorText} id="tracking-error">
                  {t("Enter the complete tracking code from your receipt.")}
                </p>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="access-key">{t("Private access key")}</label>
                <button type="button" onClick={() => setShowKey((visible) => !visible)}>
                  {t(showKey ? "Hide" : "Show")}
                </button>
              </div>
              <div className={styles.secretInput}>
                <input
                  aria-describedby="key-hint key-error"
                  aria-invalid={attempted && !accessKeyValid}
                  autoCapitalize="characters"
                  autoComplete="off"
                  id="access-key"
                  onChange={(event) => {
                    setAccessKey(formatAccessKey(event.target.value));
                    setAccessError("");
                  }}
                  placeholder="XXXX XXXX XXXX XXXX"
                  spellCheck={false}
                  type={showKey ? "text" : "password"}
                  value={accessKey}
                />
                <span aria-hidden="true">16 {t("characters")}</span>
              </div>
              <p className={styles.fieldHint} id="key-hint">
                {t("This key cannot be recovered if it is lost.")}
              </p>
              {attempted && !accessKeyValid && (
                <p className={styles.errorText} id="key-error">
                  {t("Enter all four groups of your private access key.")}
                </p>
              )}
            </div>

            {accessError && (
              <div className={styles.accessError} role="alert">
                <span aria-hidden="true">!</span>
                <p>{accessError}</p>
              </div>
            )}

            <button className={styles.primaryButton} disabled={isOpening} type="submit">
              {t(isOpening ? "Opening secure case…" : "Access private case")}{" "}
              <span aria-hidden="true">→</span>
            </button>

            <p className={styles.formFootnote}>
              {t("Never share both credentials with another person. SilentSignals support will never ask for your private access key.")}
            </p>
          </form>

          <div className={styles.helpCard}>
            <span aria-hidden="true">?</span>
            <div>
              <strong>{t("Using an older preview receipt?")}</strong>
              <p>
                {t("Earlier previews did not save a case. Create one new report to generate an encrypted record that can be reopened here.")}
              </p>
            </div>
            <Link href="/report">{t("New report")}</Link>
          </div>
        </div>
      </section>

      <CaseFooter />
    </main>
  );
}

function CaseHeader({
  actionLabel,
  onAction,
}: {
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <header className={styles.header}>
      <Link className="brand" href="/" aria-label="SilentSignals home">
        <BrandIdentity />
      </Link>
      <div className={styles.headerTrust}>
        <i aria-hidden="true" />
        {t("Private credential access")}
      </div>
      <div className={styles.headerActions}>
        <LanguageToggle />
        {onAction ? (
          <button className={styles.exitLink} type="button" onClick={onAction}>
            {actionLabel ? t(actionLabel) : null}
          </button>
        ) : (
          <Link className={styles.exitLink} href="/">
            {t("Return home")}
          </Link>
        )}
      </div>
    </header>
  );
}

function CaseFooter() {
  const { t } = useLanguage();
  return (
    <footer className={styles.footer}>
      <span>{t("SilentSignals secure workspace")}</span>
      <span>{t("Private access without an identity account")}</span>
    </footer>
  );
}
