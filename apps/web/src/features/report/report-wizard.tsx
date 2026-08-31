"use client";

import Link from "next/link";
import { upload } from "@vercel/blob/client";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import { savePreviewCase } from "@/lib/preview-case-store";
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

function generateSegment(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

function generateReceipt(): Omit<Receipt, "source"> {
  const year = new Date().getFullYear();

  return {
    trackingCode: `SIG-${year}-${generateSegment(4)}-${generateSegment(4)}`,
    accessKey: [4, 4, 4, 4].map((length) => generateSegment(length)).join(" "),
  };
}

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
      setEvidenceError("You can attach up to five files.");
      event.target.value = "";
      return;
    }

    if (oversizedFile) {
      setEvidenceError(`${oversizedFile.name} is larger than 15 MB.`);
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

      if (response && response.status !== 503) {
        const result = (await response.json().catch(() => null)) as ReportApiResponse | null;
        setReceiptError(
          result?.error?.message ?? "The secure report service could not accept this report.",
        );
        return;
      }

      const nextReceipt: Receipt = {
        ...generateReceipt(),
        source: "encrypted_preview",
      };
      const createdAt = new Date().toISOString();

      await savePreviewCase(
        {
          version: 1,
          trackingCode: nextReceipt.trackingCode,
          status: "received",
          route: isProtectedRoute ? "Independent oversight" : "Internal ethics committee",
          category: draft.category,
          urgency: draft.urgency,
          title: draft.title,
          description: draft.description,
          createdAt,
          updatedAt: createdAt,
          evidenceCount: evidence.length,
        },
        nextReceipt.accessKey,
      );

      setReceipt(nextReceipt);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setReceiptError(
        "This browser blocked encrypted preview storage. Allow site data and try again.",
      );
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
              {receipt.source === "database" ? "Report secured" : "Encrypted local preview"}
            </p>
            <h1>Your private case credentials are ready.</h1>
            <p>
              {receipt.source === "database"
                ? "Your report is encrypted in the secure case database and is ready for authorized review."
                : "An encrypted preview record is saved only in this browser so you can test private case access. Nothing has been transmitted to a server."}
            </p>
          </div>

          <div className={styles.receiptCard}>
            <CredentialRow
              label="Tracking code"
              value={receipt.trackingCode}
              copied={copied === "tracking"}
              onCopy={() => copyCredential("tracking", receipt.trackingCode)}
            />
            <CredentialRow
              label="Private access key"
              value={receipt.accessKey}
              copied={copied === "access"}
              onCopy={() => copyCredential("access", receipt.accessKey)}
            />
            {uploadWarning && (
              <div className={styles.receiptWarning} role="status">
                <strong>Evidence upload needs attention.</strong>
                <p>{uploadWarning}</p>
              </div>
            )}
            <div className={styles.receiptWarning}>
              <strong>Save both values somewhere private.</strong>
              <p>
                {receipt.source === "database"
                  ? "The private access key is shown once and cannot be recovered by SilentSignals."
                  : "These credentials open the encrypted preview on this browser. Evidence file contents were not stored or uploaded."}
              </p>
            </div>
            <div className={styles.receiptActions}>
              <Link className={styles.primaryButton} href="/track">
                Open case tracking <span aria-hidden="true">→</span>
              </Link>
              <button className={styles.secondaryButton} type="button" onClick={resetWizard}>
                Start another report
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
          <p className={styles.progressEyebrow}>Private report</p>
          <h1>Share what happened, one clear step at a time.</h1>
          <ol className={styles.progressList}>
            {steps.map((step, index) => (
              <li
                className={index === currentStep ? styles.activeStep : ""}
                key={step}
                aria-current={index === currentStep ? "step" : undefined}
              >
                <span>{index < currentStep ? "✓" : `0${index + 1}`}</span>
                <div>
                  <strong>{step}</strong>
                  <small>{index < currentStep ? "Complete" : index === currentStep ? "In progress" : "Upcoming"}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.localDraftNote}>
            <span aria-hidden="true">•</span>
            <p>Your draft stays only in this browser tab during this preview.</p>
          </div>
        </aside>

        <section className={styles.formPanel} aria-live="polite">
          <div className={styles.mobileProgress}>
            <span>
              Step {currentStep + 1} of {steps.length}
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
                Back
              </button>
            ) : (
              <Link className={styles.secondaryButton} href="/">
                Cancel
              </Link>
            )}

            {currentStep < steps.length - 1 ? (
              <button className={styles.primaryButton} type="button" onClick={moveNext}>
                Continue <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={createPreviewReceipt}
                disabled={isCreatingReceipt}
              >
                {isCreatingReceipt
                  ? uploadStatus || "Securing report…"
                  : "Submit secure report"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
          {receiptError && <p className={styles.errorText}>{receiptError}</p>}
        </section>

        <aside className={styles.assurancePanel}>
          <p className={styles.assuranceTitle}>Privacy reminder</p>
          <p>Describe events and evidence, not details that identify you.</p>
          <dl>
            <div>
              <dt>Not requested</dt>
              <dd>Name, email, student ID, phone</dd>
            </div>
            <div>
              <dt>Draft storage</dt>
              <dd>Memory only in this preview</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>Private storage with restricted case access</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

function ReportHeader() {
  return (
    <header className={styles.header}>
      <Link className="brand" href="/" aria-label="SilentSignals home">
        <BrandIdentity />
      </Link>
      <div className={styles.headerStatus}>
        <span aria-hidden="true" />
        Secure reporting workspace
      </div>
      <Link className={styles.exitLink} href="/">
        Exit report
      </Link>
    </header>
  );
}

type StepProps = {
  draft: Draft;
  updateDraft: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  showErrors: boolean;
};

function StepHeading({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className={styles.stepHeading}>
      <p>{index}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </div>
  );
}

function StepContext({ draft, updateDraft, showErrors }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="01 / Context"
        title="Which perspective are you reporting from?"
        description="This helps the committee understand context. It does not identify you."
      />

      <fieldset className={styles.fieldset}>
        <legend>Your relationship to the institution</legend>
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
              <strong>{label}</strong>
              <small>{description}</small>
            </label>
          ))}
        </div>
        {showErrors && !draft.reporterRole && (
          <p className={styles.errorText}>Select the perspective that fits best.</p>
        )}
      </fieldset>

      <div className={styles.fieldGroup}>
        <label htmlFor="category">What is the concern mainly about?</label>
        <select
          id="category"
          value={draft.category}
          onChange={(event) => updateDraft("category", event.target.value)}
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        {showErrors && !draft.category && (
          <p className={styles.errorText}>Select a concern category.</p>
        )}
      </div>

      <fieldset className={styles.fieldset}>
        <legend>How quickly does this need attention?</legend>
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
              <strong>{label}</strong>
              <small>{description}</small>
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
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="02 / Routing"
        title="Who or what does the concern involve?"
        description="The answer controls who is technically allowed to review the report."
      />

      <fieldset className={styles.fieldset}>
        <legend>Primary subject of the report</legend>
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
                <strong>{label}</strong>
                <small>{description}</small>
              </div>
              <span aria-hidden="true">→</span>
            </label>
          ))}
        </div>
        {showErrors && !draft.target && (
          <p className={styles.errorText}>Select the closest routing option.</p>
        )}
      </fieldset>

      {isProtectedRoute && (
        <div className={styles.protectedNotice} role="status">
          <span className={styles.protectedIcon} aria-hidden="true">
            !
          </span>
          <div>
            <strong>Independent route activated</strong>
            <p>
              This selection is marked for external oversight. Internal committee accounts
              will not receive normal case access.
            </p>
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label htmlFor="department">Department or unit (optional)</label>
        <input
          id="department"
          maxLength={120}
          onChange={(event) => updateDraft("department", event.target.value)}
          placeholder="For example: Department of Computer Science"
          type="text"
          value={draft.department}
        />
        <small>Avoid including a person&apos;s name here.</small>
      </div>
    </div>
  );
}

function StepDetails({ draft, updateDraft, showErrors }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="03 / Details"
        title="Describe what happened."
        description="Focus on events, timing, impact, and available evidence."
      />

      <div className={styles.identityWarning}>
        <strong>Before you write</strong>
        <p>
          Do not include your name, email, student ID, phone number, or details that are not
          necessary for the investigation.
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.labelRow}>
          <label htmlFor="report-title">Short summary</label>
          <span>{draft.title.length} / 120</span>
        </div>
        <input
          id="report-title"
          maxLength={120}
          onChange={(event) => updateDraft("title", event.target.value)}
          placeholder="Summarize the concern without identifying yourself"
          type="text"
          value={draft.title}
        />
        {showErrors && draft.title.trim().length < 10 && (
          <p className={styles.errorText}>Use at least 10 characters for the summary.</p>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.labelRow}>
          <label htmlFor="description">Detailed account</label>
          <span>{draft.description.length} / 5000</span>
        </div>
        <textarea
          id="description"
          maxLength={5000}
          onChange={(event) => updateDraft("description", event.target.value)}
          placeholder="Explain what happened, when it happened, who was involved by role, and what impact it had..."
          rows={10}
          value={draft.description}
        />
        <small>Minimum 80 characters. Clear facts are more useful than conclusions.</small>
        {showErrors && draft.description.trim().length < 80 && (
          <p className={styles.errorText}>Add at least 80 characters of useful detail.</p>
        )}
      </div>

      <div className={styles.twoColumnFields}>
        <div className={styles.fieldGroup}>
          <label htmlFor="incident-date">Approximate date (optional)</label>
          <input
            id="incident-date"
            max={new Date().toISOString().split("T")[0]}
            onChange={(event) => updateDraft("incidentDate", event.target.value)}
            type="date"
            value={draft.incidentDate}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="location">Location or channel (optional)</label>
          <input
            id="location"
            maxLength={120}
            onChange={(event) => updateDraft("location", event.target.value)}
            placeholder="Classroom, office, email, online meeting..."
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
        <strong>Choose evidence files</strong>
        <p>PDF, images, documents, text, audio, or video. Up to 5 files, 15 MB each.</p>
        <small>Files upload only after the report is created and are stored privately.</small>
      </label>

      {error && <p className={styles.errorText}>{error}</p>}

      {evidence.length > 0 && (
        <div className={styles.fileList}>
          <div className={styles.fileListHeader}>
            <strong>Selected locally</strong>
            <span>{evidence.length} / 5 files</span>
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
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.evidenceProcess}>
        <p>Protected evidence pipeline</p>
        <div>
          <span>01 Validate type</span>
          <i aria-hidden="true">→</i>
          <span>02 Private upload</span>
          <i aria-hidden="true">→</i>
          <span>03 Restricted access</span>
          <i aria-hidden="true">→</i>
          <span>04 Encrypt storage</span>
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
  return (
    <div className={styles.stepContent}>
      <StepHeading
        index="05 / Review"
        title="Review the report before creating access credentials."
        description="Confirm that the information is accurate and does not unnecessarily identify you."
      />

      <div className={styles.reviewGrid}>
        <ReviewItem label="Your context" value={getLabel(roleOptions, draft.reporterRole)} />
        <ReviewItem label="Category" value={draft.category} />
        <ReviewItem label="Urgency" value={draft.urgency} capitalize />
        <ReviewItem label="Subject" value={getLabel(targetOptions, draft.target)} />
        <ReviewItem
          label="Routing"
          value={isProtectedRoute ? "Independent oversight" : "Internal ethics committee"}
        />
        <ReviewItem label="Evidence" value={`${evidence.length} selected file(s)`} />
      </div>

      <div className={styles.reviewNarrative}>
        <span>Report summary</span>
        <h3>{draft.title}</h3>
        <p>{draft.description}</p>
        {(draft.incidentDate || draft.location || draft.department) && (
          <dl>
            {draft.department && (
              <div>
                <dt>Unit</dt>
                <dd>{draft.department}</dd>
              </div>
            )}
            {draft.incidentDate && (
              <div>
                <dt>Date</dt>
                <dd>{draft.incidentDate}</dd>
              </div>
            )}
            {draft.location && (
              <div>
                <dt>Location</dt>
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
          <strong>I reviewed this report for unnecessary identifying information.</strong>
          <p>
            I understand this development preview stores an encrypted record only in this
            browser and does not send the report to a server.
          </p>
        </div>
      </label>
      {showErrors && !draft.consent && (
        <p className={styles.errorText}>Confirm the review statement to continue.</p>
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
  return (
    <div className={styles.credentialRow}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <button type="button" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
