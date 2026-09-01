"use client";

import Link from "next/link";
import { upload } from "@vercel/blob/client";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/i18n/language-context";
import styles from "./report-wizard.module.css";

const steps = ["Context", "Routing", "Details", "Evidence", "Review"] as const;

const roleOptions = [
  ["student", "Student", "Currently enrolled or recently graduated"],
  ["faculty", "Faculty", "Teaching, research, or academic appointment"],
  ["staff", "Staff", "Administrative, operational, or support role"],
  ["other", "Other", "Visitor, contractor, guardian, or community member"],
] as const;

const targetOptions = [
  ["student", "Student or peer", "Standard committee review"],
  ["faculty", "Faculty member", "Standard committee review"],
  ["department", "Department or administration", "Conflict screening required"],
  ["leadership", "Senior leadership", "Independent routing review"],
  ["vice_chancellor", "Vice Chancellor", "External oversight route"],
] as const;

const categories = [
  "Harassment or bullying",
  "Discrimination",
  "Academic misconduct",
  "Unfair grading or assessment",
  "Corruption or misuse of authority",
  "Safety or security concern",
  "Financial misconduct",
  "Other concern",
];

type Draft = {
  reporterRole: string;
  category: string;
  urgency: string;
  target: string;
  department: string;
  title: string;
  description: string;
  incidentDate: string;
  location: string;
  consent: boolean;
};

type Receipt = {
  trackingCode: string;
  accessKey: string;
  source: "database" | "encrypted_preview";
  evidenceUploaded?: number;
};

type ReportApiResponse = {
  data?: {
    trackingCode: string;
    accessKey: string;
    status: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

const initialDraft: Draft = {
  reporterRole: "",
  category: "",
  urgency: "standard",
  target: "",
  department: "",
  title: "",
  description: "",
  incidentDate: "",
  location: "",
  consent: false,
};

function getLabel(options: readonly (readonly string[])[], value: string) {
  return options.find(([key]) => key === value)?.[1] ?? "Not selected";
}

function getEvidenceContentType(file: File) {
  if (file.type) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    txt: "text/plain",
    mp3: "audio/mpeg",
    m4a: "audio/x-m4a",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
  };

  return types[extension ?? ""] ?? "application/octet-stream";
}

export function ReportWizard() {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [currentStep, setCurrentStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [evidence, setEvidence] = useState<File[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState<"tracking" | "access" | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isCreatingReceipt, setIsCreatingReceipt] = useState(false);

  const isProtectedRoute = useMemo(
    () => draft.target === "leadership" || draft.target === "vice_chancellor",
    [draft.target],
  );

  const updateDraft = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const isStepValid = (step: number) => {
    if (step === 0) {
      return Boolean(draft.reporterRole && draft.category && draft.urgency);
    }

    if (step === 1) {
      return Boolean(draft.target);
    }

    if (step === 2) {
      return draft.title.trim().length >= 10 && draft.description.trim().length >= 80;
    }

    if (step === 3) {
      return !evidenceError;
    }

    return draft.consent;
  };

  const moveNext = () => {
    if (!isStepValid(currentStep)) {
      setShowErrors(true);
      return;
    }

    setShowErrors(false);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const moveBack = () => {
    setShowErrors(false);
    setCurrentStep((step) => Math.max(step - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    const combinedFiles = [...evidence, ...selectedFiles];
    const oversizedFile = combinedFiles.find((file) => file.size > 15 * 1024 * 1024);

    if (combinedFiles.length > 5) {
      setEvidenceError(t("You can attach up to five files."));
      event.target.value = "";
      return;
    }

    if (oversizedFile) {
      setEvidenceError(`${oversizedFile.name} ${t("is larger than 15 MB.")}`);
      event.target.value = "";
      return;
    }

    setEvidenceError("");
    setEvidence(combinedFiles);
    event.target.value = "";
  };

  const removeEvidence = (name: string) => {
    setEvidence((files) => files.filter((file) => file.name !== name));
    setEvidenceError("");
  };

  const createPreviewReceipt = async () => {
    if (!draft.consent) {
      setShowErrors(true);
      return;
    }

    setReceiptError("");
    setUploadWarning("");
    setUploadStatus("");
    setIsCreatingReceipt(true);

    try {
      let response: Response | null = null;

      try {
        response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
      } catch {
        response = null;
      }

      if (response?.ok) {
        const result = (await response.json()) as ReportApiResponse;

        if (result.data) {
          let uploadedCount = 0;

          if (evidence.length > 0) {
            setUploadStatus(`Uploading 0 of ${evidence.length} files…`);
            const uploadResults = await Promise.allSettled(
              evidence.map(async (file, index) => {
                const contentType = getEvidenceContentType(file);
                return upload(`evidence/${crypto.randomUUID()}`, file, {
                  access: "private",
                  handleUploadUrl: "/api/cases/evidence/upload",
                  multipart: file.size > 4 * 1024 * 1024,
                  contentType,
                  clientPayload: JSON.stringify({
                    fileName: file.name,
                    contentType,
                    byteSize: file.size,
                  }),
                  onUploadProgress: ({ percentage }) => {
                    setUploadStatus(
                      `Protecting file ${index + 1} of ${evidence.length} · ${Math.round(percentage)}%`,
                    );
                  },
                });
              }),
            );
            uploadedCount = uploadResults.filter((item) => item.status === "fulfilled").length;

            if (uploadedCount < evidence.length) {
              setUploadWarning(
                `${uploadedCount} of ${evidence.length} evidence files were attached. The report is secure; missing files can be added from the private case workspace after storage is configured.`,
              );
            }
          }

          setReceipt({
            trackingCode: result.data.trackingCode,
            accessKey: result.data.accessKey,
            source: "database",
            evidenceUploaded: uploadedCount,
          });
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }

      if (response) {
        const result = (await response.json().catch(() => null)) as ReportApiResponse | null;
        setReceiptError(
          t(result?.error?.message ??
            "The secure report service is temporarily unavailable. Nothing was submitted; try again."),
        );
        return;
      }

      setReceiptError(t("The secure report service is unreachable. Nothing was submitted; try again."));
    } catch {
      setReceiptError(t("The secure report service is unreachable. Nothing was submitted; try again."));
    } finally {
      setUploadStatus("");
      setIsCreatingReceipt(false);
    }
  };

  const copyCredential = async (kind: "tracking" | "access", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const resetWizard = () => {
    setDraft(initialDraft);
    setEvidence([]);
    setEvidenceError("");
    setReceipt(null);
    setCurrentStep(0);
    setShowErrors(false);
    setReceiptError("");
    setUploadWarning("");
    setUploadStatus("");
  };

  if (receipt) {
    return (
      <main className={styles.page}>
        <ReportHeader />
        <section className={styles.receiptLayout}>
          <div className={styles.receiptIntro}>
            <span className={styles.successMark} aria-hidden="true">
              ✓
            </span>
            <p className={styles.eyebrow}>
              {t(receipt.source === "database" ? "Report secured" : "Encrypted local preview")}
            </p>
            <h1>{t("Your private case credentials are ready.")}</h1>
            <p>
              {receipt.source === "database"
                ? t("Your report is encrypted in the secure case database and is ready for authorized review.")
                : t("An encrypted preview record is saved only in this browser so you can test private case access. Nothing has been transmitted to a server.")}
            </p>
          </div>

          <div className={styles.receiptCard}>
            <CredentialRow
              label={t("Tracking code")}
              value={receipt.trackingCode}
              copied={copied === "tracking"}
              onCopy={() => copyCredential("tracking", receipt.trackingCode)}
            />
            <CredentialRow
              label={t("Private access key")}
              value={receipt.accessKey}
              copied={copied === "access"}
              onCopy={() => copyCredential("access", receipt.accessKey)}
            />
            {uploadWarning && (
              <div className={styles.receiptWarning} role="status">
                <strong>{t("Evidence upload needs attention.")}</strong>
                <p>{uploadWarning}</p>
              </div>
            )}
            <div className={styles.receiptWarning}>
              <strong>{t("Save both values somewhere private.")}</strong>
              <p>
                {receipt.source === "database"
                  ? t("The private access key is shown once and cannot be recovered by SilentSignals.")
                  : t("These credentials open the encrypted preview on this browser. Evidence file contents were not stored or uploaded.")}
              </p>
            </div>
            <div className={styles.receiptActions}>
              <Link className={styles.primaryButton} href="/track">
                {t("Open case tracking")} <span aria-hidden="true">→</span>
              </Link>
              <button className={styles.secondaryButton} type="button" onClick={resetWizard}>
                {t("Start another report")}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <ReportHeader />

      <div className={styles.wizardLayout}>
        <aside className={styles.progressPanel} aria-label="Report progress">
          <p className={styles.progressEyebrow}>{t("Private report")}</p>
          <h1>{t("Share what happened, one clear step at a time.")}</h1>
          <ol className={styles.progressList}>
            {steps.map((step, index) => (
              <li
                className={index === currentStep ? styles.activeStep : ""}
                key={step}
                aria-current={index === currentStep ? "step" : undefined}
              >
                <span>{index < currentStep ? "✓" : `0${index + 1}`}</span>
                <div>
                  <strong>{t(step)}</strong>
                  <small>{t(index < currentStep ? "Complete" : index === currentStep ? "In progress" : "Upcoming")}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.localDraftNote}>
            <span aria-hidden="true">•</span>
            <p>{t("Your draft stays only in this browser tab during this preview.")}</p>
          </div>
        </aside>

        <section className={styles.formPanel} aria-live="polite">
          <div className={styles.mobileProgress}>
            <span>
              {t("Step")} {currentStep + 1} {t("of")} {steps.length}
            </span>
            <div>
              <i style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
            </div>
          </div>

          {currentStep === 0 && (
            <StepContext draft={draft} updateDraft={updateDraft} showErrors={showErrors} />
          )}
          {currentStep === 1 && (
            <StepRouting
              draft={draft}
              updateDraft={updateDraft}
              showErrors={showErrors}
              isProtectedRoute={isProtectedRoute}
            />
          )}
          {currentStep === 2 && (
            <StepDetails draft={draft} updateDraft={updateDraft} showErrors={showErrors} />
          )}
          {currentStep === 3 && (
            <StepEvidence
              evidence={evidence}
              error={evidenceError}
              onFiles={handleFiles}
              onRemove={removeEvidence}
            />
          )}
          {currentStep === 4 && (
            <StepReview
              draft={draft}
              evidence={evidence}
              isProtectedRoute={isProtectedRoute}
              showErrors={showErrors}
              updateDraft={updateDraft}
            />
          )}

          <div className={styles.formActions}>
            {currentStep > 0 ? (
              <button className={styles.secondaryButton} type="button" onClick={moveBack}>
                {t("Back")}
              </button>
            ) : (
              <Link className={styles.secondaryButton} href="/">
                {t("Cancel")}
              </Link>
            )}

            {currentStep < steps.length - 1 ? (
              <button className={styles.primaryButton} type="button" onClick={moveNext}>
                {t("Continue")} <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={createPreviewReceipt}
                disabled={isCreatingReceipt}
              >
                {isCreatingReceipt
                  ? uploadStatus || t("Securing report…")
                  : t("Submit secure report")}{" "}
                <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
          {receiptError && <p className={styles.errorText}>{receiptError}</p>}
        </section>

        <aside className={styles.assurancePanel}>
          <p className={styles.assuranceTitle}>{t("Privacy reminder")}</p>
          <p>{t("Describe events and evidence, not details that identify you.")}</p>
          <dl>
            <div>
              <dt>{t("Not requested")}</dt>
              <dd>{t("Name, email, student ID, phone")}</dd>
            </div>
            <div>
              <dt>{t("Draft storage")}</dt>
              <dd>{t("Memory only in this preview")}</dd>
            </div>
            <div>
              <dt>{t("Evidence")}</dt>
              <dd>{t("Private storage with restricted case access")}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

function ReportHeader() {
  const { t } = useLanguage();
  return (
    <header className={styles.header}>
      <Link className="brand" href="/" aria-label="SilentSignals home">
        <BrandIdentity />
      </Link>
      <div className={styles.headerStatus}>
        <span aria-hidden="true" />
        {t("Secure reporting workspace")}
      </div>
      <div className={styles.headerActions}>
        <LanguageToggle />
        <Link className={styles.exitLink} href="/">
          {t("Exit report")}
        </Link>
      </div>
    </header>
  );
}

type StepProps = {
  draft: Draft;
  updateDraft: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  showErrors: boolean;
};

function StepHeading({ index, title, description }: { index: string; title: string; description: string }) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepHeading}>
      <p>{t(index)}</p>
      <h2>{t(title)}</h2>
      <span>{t(description)}</span>
    </div>
  );
}

function StepContext({ draft, updateDraft, showErrors }: StepProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="01 / Context"
        title="Which perspective are you reporting from?"
        description="This helps the committee understand context. It does not identify you."
      />

      <fieldset className={styles.fieldset}>
        <legend>{t("Your relationship to the institution")}</legend>
        <div className={styles.optionGrid}>
          {roleOptions.map(([value, label, description]) => (
            <label className={styles.optionCard} key={value}>
              <input
                checked={draft.reporterRole === value}
                name="reporter-role"
                onChange={() => updateDraft("reporterRole", value)}
                type="radio"
                value={value}
              />
              <span className={styles.radioIndicator} aria-hidden="true" />
              <strong>{t(label)}</strong>
              <small>{t(description)}</small>
            </label>
          ))}
        </div>
        {showErrors && !draft.reporterRole && (
          <p className={styles.errorText}>{t("Select the perspective that fits best.")}</p>
        )}
      </fieldset>

      <div className={styles.fieldGroup}>
        <label htmlFor="category">{t("What is the concern mainly about?")}</label>
        <select
          id="category"
          value={draft.category}
          onChange={(event) => updateDraft("category", event.target.value)}
        >
          <option value="">{t("Select a category")}</option>
          {categories.map((category) => (
            <option key={category} value={category}>{t(category)}</option>
          ))}
        </select>
        {showErrors && !draft.category && (
          <p className={styles.errorText}>{t("Select a concern category.")}</p>
        )}
      </div>

      <fieldset className={styles.fieldset}>
        <legend>{t("How quickly does this need attention?")}</legend>
        <div className={styles.segmentedControl}>
          {[
            ["standard", "Standard", "No immediate danger"],
            ["urgent", "Urgent", "Ongoing harm or retaliation"],
            ["immediate", "Immediate", "Current safety risk"],
          ].map(([value, label, description]) => (
            <label key={value}>
              <input
                checked={draft.urgency === value}
                name="urgency"
                onChange={() => updateDraft("urgency", value)}
                type="radio"
                value={value}
              />
              <strong>{t(label)}</strong>
              <small>{t(description)}</small>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function StepRouting({
  draft,
  updateDraft,
  showErrors,
  isProtectedRoute,
}: StepProps & { isProtectedRoute: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="02 / Routing"
        title="Who or what does the concern involve?"
        description="The answer controls who is technically allowed to review the report."
      />

      <fieldset className={styles.fieldset}>
        <legend>{t("Primary subject of the report")}</legend>
        <div className={styles.targetList}>
          {targetOptions.map(([value, label, description]) => (
            <label className={styles.targetOption} key={value}>
              <input
                checked={draft.target === value}
                name="target"
                onChange={() => updateDraft("target", value)}
                type="radio"
                value={value}
              />
              <span className={styles.radioIndicator} aria-hidden="true" />
              <div>
                <strong>{t(label)}</strong>
                <small>{t(description)}</small>
              </div>
              <span aria-hidden="true">→</span>
            </label>
          ))}
        </div>
        {showErrors && !draft.target && (
          <p className={styles.errorText}>{t("Select the closest routing option.")}</p>
        )}
      </fieldset>

      {isProtectedRoute && (
        <div className={styles.protectedNotice} role="status">
          <span className={styles.protectedIcon} aria-hidden="true">
            !
          </span>
          <div>
            <strong>{t("Independent route activated")}</strong>
            <p>
              {t("This selection is marked for external oversight. Internal committee accounts will not receive normal case access.")}
            </p>
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label htmlFor="department">{t("Department or unit (optional)")}</label>
        <input
          id="department"
          maxLength={120}
          onChange={(event) => updateDraft("department", event.target.value)}
          placeholder={t("For example: Department of Computer Science")}
          type="text"
          value={draft.department}
        />
        <small>{t("Avoid including a person's name here.")}</small>
      </div>
    </div>
  );
}

function StepDetails({ draft, updateDraft, showErrors }: StepProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="03 / Details"
        title="Describe what happened."
        description="Focus on events, timing, impact, and available evidence."
      />

      <div className={styles.identityWarning}>
        <strong>{t("Before you write")}</strong>
        <p>
          {t("Do not include your name, email, student ID, phone number, or details that are not necessary for the investigation.")}
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.labelRow}>
          <label htmlFor="report-title">{t("Short summary")}</label>
          <span>{draft.title.length} / 120</span>
        </div>
        <input
          id="report-title"
          maxLength={120}
          onChange={(event) => updateDraft("title", event.target.value)}
          placeholder={t("Summarize the concern without identifying yourself")}
          type="text"
          value={draft.title}
        />
        {showErrors && draft.title.trim().length < 10 && (
          <p className={styles.errorText}>{t("Use at least 10 characters for the summary.")}</p>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.labelRow}>
          <label htmlFor="description">{t("Detailed account")}</label>
          <span>{draft.description.length} / 5000</span>
        </div>
        <textarea
          id="description"
          maxLength={5000}
          onChange={(event) => updateDraft("description", event.target.value)}
          placeholder={t("Explain what happened, when it happened, who was involved by role, and what impact it had...")}
          rows={10}
          value={draft.description}
        />
        <small>{t("Minimum 80 characters. Clear facts are more useful than conclusions.")}</small>
        {showErrors && draft.description.trim().length < 80 && (
          <p className={styles.errorText}>{t("Add at least 80 characters of useful detail.")}</p>
        )}
      </div>

      <div className={styles.twoColumnFields}>
        <div className={styles.fieldGroup}>
          <label htmlFor="incident-date">{t("Approximate date (optional)")}</label>
          <input
            id="incident-date"
            max={new Date().toISOString().split("T")[0]}
            onChange={(event) => updateDraft("incidentDate", event.target.value)}
            type="date"
            value={draft.incidentDate}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="location">{t("Location or channel (optional)")}</label>
          <input
            id="location"
            maxLength={120}
            onChange={(event) => updateDraft("location", event.target.value)}
            placeholder={t("Classroom, office, email, online meeting...")}
            type="text"
            value={draft.location}
          />
        </div>
      </div>
    </div>
  );
}

function StepEvidence({
  evidence,
  error,
  onFiles,
  onRemove,
}: {
  evidence: File[];
  error: string;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="04 / Evidence"
        title="Add supporting material if it helps."
        description="Evidence is optional. A report can continue without an attachment."
      />

      <label className={styles.uploadZone}>
        <input
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.mp3,.m4a,.wav,.mp4,.webm"
          multiple
          onChange={onFiles}
          type="file"
        />
        <span className={styles.uploadIcon} aria-hidden="true">
          +
        </span>
        <strong>{t("Choose evidence files")}</strong>
        <p>{t("PDF, images, documents, text, audio, or video. Up to 5 files, 15 MB each.")}</p>
        <small>{t("Files upload only after the report is created and are stored privately.")}</small>
      </label>

      {error && <p className={styles.errorText}>{error}</p>}

      {evidence.length > 0 && (
        <div className={styles.fileList}>
          <div className={styles.fileListHeader}>
            <strong>{t("Selected locally")}</strong>
            <span>{evidence.length} / 5 {t("files")}</span>
          </div>
          {evidence.map((file) => (
            <div className={styles.fileItem} key={`${file.name}-${file.lastModified}`}>
              <span className={styles.fileType} aria-hidden="true">
                {file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
              </span>
              <div>
                <strong>{file.name}</strong>
                <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
              </div>
              <button type="button" onClick={() => onRemove(file.name)}>
                {t("Remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.evidenceProcess}>
        <p>{t("Protected evidence pipeline")}</p>
        <div>
          <span>{t("01 Validate type")}</span>
          <i aria-hidden="true">→</i>
          <span>{t("02 Private upload")}</span>
          <i aria-hidden="true">→</i>
          <span>{t("03 Restricted access")}</span>
          <i aria-hidden="true">→</i>
          <span>{t("04 Encrypt storage")}</span>
        </div>
      </div>
    </div>
  );
}

function StepReview({
  draft,
  evidence,
  isProtectedRoute,
  showErrors,
  updateDraft,
}: StepProps & { evidence: File[]; isProtectedRoute: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="05 / Review"
        title="Review the report before creating access credentials."
        description="Confirm that the information is accurate and does not unnecessarily identify you."
      />

      <div className={styles.reviewGrid}>
        <ReviewItem label={t("Your context")} value={t(getLabel(roleOptions, draft.reporterRole))} />
        <ReviewItem label={t("Category")} value={t(draft.category)} />
        <ReviewItem label={t("Urgency")} value={t(draft.urgency)} capitalize />
        <ReviewItem label={t("Subject")} value={t(getLabel(targetOptions, draft.target))} />
        <ReviewItem
          label={t("Routing")}
          value={t(isProtectedRoute ? "Independent oversight" : "Internal ethics committee")}
        />
        <ReviewItem label={t("Evidence")} value={`${evidence.length} ${t("selected file(s)")}`} />
      </div>

      <div className={styles.reviewNarrative}>
        <span>{t("Report summary")}</span>
        <h3>{draft.title}</h3>
        <p>{draft.description}</p>
        {(draft.incidentDate || draft.location || draft.department) && (
          <dl>
            {draft.department && (
              <div>
                <dt>{t("Unit")}</dt>
                <dd>{draft.department}</dd>
              </div>
            )}
            {draft.incidentDate && (
              <div>
                <dt>{t("Date")}</dt>
                <dd>{draft.incidentDate}</dd>
              </div>
            )}
            {draft.location && (
              <div>
                <dt>{t("Location")}</dt>
                <dd>{draft.location}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <label className={styles.consentBox}>
        <input
          checked={draft.consent}
          onChange={(event) => updateDraft("consent", event.target.checked)}
          type="checkbox"
        />
        <span className={styles.checkboxIndicator} aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>{t("I reviewed this report for unnecessary identifying information.")}</strong>
          <p>
            {t("I understand this report will be encrypted and stored in the secure case database for authorized review.")}
          </p>
        </div>
      </label>
      {showErrors && !draft.consent && (
        <p className={styles.errorText}>{t("Confirm the review statement to continue.")}</p>
      )}
    </div>
  );
}

function ReviewItem({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className={styles.reviewItem}>
      <span>{label}</span>
      <strong className={capitalize ? styles.capitalize : ""}>{value}</strong>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.credentialRow}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <button type="button" onClick={onCopy}>
          {t(copied ? "Copied" : "Copy")}
        </button>
      </div>
    </div>
  );
}
