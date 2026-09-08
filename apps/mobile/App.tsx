import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { File } from "expo-file-system";
import {
  ApiError,
  bootstrapGovernance,
  CaseSnapshot,
  createGovernanceTeam,
  decideGovernanceRequest,
  deleteGovernanceTeam,
  getCurrentCase,
  getGovernanceDashboard,
  getReviewerCase,
  getReviewerCases,
  getReviewerSession,
  loginReviewer,
  openCase,
  registerReviewer,
  ReportReceipt,
  ReportTarget,
  ReporterRole,
  sendReporterMessage,
  sendReviewerMessage,
  requestEvidenceUploadToken,
  submitReport,
  updateReviewerCase,
  type GovernanceDashboard,
  type GovernanceTeam,
  type ReporterMessage,
  type ReviewerCaseDetail,
  type ReviewerCaseSummary,
  type ReviewerDashboard,
  type ReviewerIdentity,
  type UrgencyLevel,
} from "./src/api";
import {
  getSecureJson,
  removeSecureItem,
  setSecureJson,
} from "./src/storage";

type MainTab = "home" | "report" | "track" | "reviewer";
type ReviewerSubTab = "login" | "request" | "governance";

type ReporterCredentials = {
  trackingCode: string;
  accessKey: string;
};

type ReviewerCredentials = {
  mode: "reviewer" | "governance";
  email: string;
  secret: string;
};

type ReportFormState = {
  reporterRole: ReporterRole;
  category: string;
  urgency: UrgencyLevel;
  target: ReportTarget;
  department: string;
  title: string;
  description: string;
  incidentDate: string;
  location: string;
  consent: boolean;
};

type TrackFormState = {
  trackingCode: string;
  accessKey: string;
};

type ReviewerLoginForm = {
  email: string;
  privateKey: string;
  password: string;
};

type ReviewerRequestForm = {
  name: string;
  email: string;
  department: string;
};

type GovernanceForm = {
  email: string;
  password: string;
};

type TeamForm = {
  label: string;
  teamType: "committee" | "independent_oversight";
};

type CaseActionForm = {
  status: string;
  priority: number;
  note: string;
  reply: string;
};

const REPORTER_ROLES: ReporterRole[] = ["student", "faculty", "staff", "other"];
const REPORT_TARGETS: ReportTarget[] = [
  "student",
  "faculty",
  "department",
  "leadership",
  "vice_chancellor",
];
const URGENCY_LEVELS: UrgencyLevel[] = ["standard", "urgent", "immediate"];
const EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
  "video/webm",
];
const REVIEWER_STATUS_OPTIONS = [
  "received",
  "triage",
  "under_review",
  "awaiting_reporter",
  "resolved",
  "closed",
];

const DEFAULT_REPORT_FORM: ReportFormState = {
  reporterRole: "student",
  category: "",
  urgency: "standard",
  target: "department",
  department: "",
  title: "",
  description: "",
  incidentDate: "",
  location: "",
  consent: false,
};

const DEFAULT_TRACK_FORM: TrackFormState = {
  trackingCode: "",
  accessKey: "",
};

const DEFAULT_REVIEWER_LOGIN: ReviewerLoginForm = {
  email: "",
  privateKey: "",
  password: "",
};

const DEFAULT_REVIEWER_REQUEST: ReviewerRequestForm = {
  name: "",
  email: "",
  department: "",
};

const DEFAULT_GOVERNANCE_FORM: GovernanceForm = {
  email: "",
  password: "",
};

const DEFAULT_TEAM_FORM: TeamForm = {
  label: "Ethics Review",
  teamType: "committee",
};

const DEFAULT_CASE_ACTION: CaseActionForm = {
  status: "triage",
  priority: 2,
  note: "",
  reply: "",
};

const COLORS = {
  bg: "#f4f6ef",
  panel: "#ffffff",
  panelSoft: "#eef3ea",
  ink: "#10251e",
  muted: "#66756d",
  green: "#0a5a46",
  greenDark: "#0a4737",
  lime: "#d7ff3f",
  border: "#d8e1d7",
  borderStrong: "#b8c9bc",
  danger: "#b85d4d",
  dangerSoft: "#f8e6e1",
  info: "#dfeaf1",
};

const APP_STORAGE_KEYS = {
  reporter: "ss_mobile_reporter_credentials",
  reviewer: "ss_mobile_reviewer_credentials",
} as const;

const BLOB_API_URL = "https://vercel.com/api/blob";

function evidenceContentType(file: File) {
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

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function createEvidenceId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function App() {
  const [tab, setTab] = useState<MainTab>("home");
  const [session, setSession] = useState<ReviewerIdentity | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

  const [reportForm, setReportForm] = useState<ReportFormState>(DEFAULT_REPORT_FORM);
  const [reporting, setReporting] = useState(false);
  const [reportReceipt, setReportReceipt] = useState<ReportReceipt | null>(null);
  const [reportedCase, setReportedCase] = useState<CaseSnapshot | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const [trackForm, setTrackForm] = useState<TrackFormState>(DEFAULT_TRACK_FORM);
  const [tracking, setTracking] = useState(false);
  const [trackedCase, setTrackedCase] = useState<CaseSnapshot | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [reporterReply, setReporterReply] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceStatus, setEvidenceStatus] = useState("");

  const [reviewerSubTab, setReviewerSubTab] = useState<ReviewerSubTab>("login");
  const [reviewerLogin, setReviewerLogin] = useState<ReviewerLoginForm>(DEFAULT_REVIEWER_LOGIN);
  const [reviewerRequest, setReviewerRequest] = useState<ReviewerRequestForm>(
    DEFAULT_REVIEWER_REQUEST,
  );
  const [governanceForm, setGovernanceForm] = useState<GovernanceForm>(DEFAULT_GOVERNANCE_FORM);
  const [teamForm, setTeamForm] = useState<TeamForm>(DEFAULT_TEAM_FORM);
  const [reviewerCredentials, setReviewerCredentials] = useState<ReviewerCredentials | null>(null);
  const [reviewerDashboard, setReviewerDashboard] = useState<ReviewerDashboard | null>(null);
  const [reviewerDashboardLoading, setReviewerDashboardLoading] = useState(false);
  const [reviewerDashboardError, setReviewerDashboardError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ReviewerCaseDetail | null>(null);
  const [selectedCaseLoading, setSelectedCaseLoading] = useState(false);
  const [selectedCaseError, setSelectedCaseError] = useState<string | null>(null);
  const [caseAction, setCaseAction] = useState<CaseActionForm>(DEFAULT_CASE_ACTION);
  const [caseActionBusy, setCaseActionBusy] = useState(false);

  const [governanceDashboard, setGovernanceDashboard] = useState<GovernanceDashboard | null>(null);
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [selectedTeamPublicId, setSelectedTeamPublicId] = useState<string | null>(null);
  const [governanceResult, setGovernanceResult] = useState<string | null>(null);

  const fade = useRef(new Animated.Value(0)).current;

  const selectedTeam = useMemo(() => {
    if (!governanceDashboard) return null;
    return (
      governanceDashboard.teams.find((team) => team.publicId === selectedTeamPublicId) ??
      governanceDashboard.teams[0] ??
      null
    );
  }, [governanceDashboard, selectedTeamPublicId]);

  const statusLabel = useMemo(() => {
    if (session?.role === "administrator") return "Dean / VC signed in";
    if (session?.role === "reviewer") return "Reviewer signed in";
    if (loadingSession) return "Restoring session";
    return "Ready";
  }, [loadingSession, session]);

  const refreshSession = useCallback(async () => {
    try {
      const identity = await getReviewerSession();
      setSession(identity);
      setReviewerCredentials(null);
    } catch {
      setSession(null);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const loadReviewerDashboard = useCallback(async () => {
    setReviewerDashboardLoading(true);
    setReviewerDashboardError(null);
    try {
      const dashboard = await getReviewerCases();
      setReviewerDashboard(dashboard);
      if (!selectedCaseId && dashboard.cases[0]) {
        setSelectedCaseId(dashboard.cases[0].id);
      }
    } catch (error) {
      setReviewerDashboardError(formatError(error));
    } finally {
      setReviewerDashboardLoading(false);
    }
  }, [selectedCaseId]);

  const loadSelectedCase = useCallback(async (caseId: string) => {
    setSelectedCaseLoading(true);
    setSelectedCaseError(null);
    try {
      const detail = await getReviewerCase(caseId);
      setSelectedCase(detail);
      setCaseAction((current) => ({
        ...current,
        status: detail.status,
      }));
    } catch (error) {
      setSelectedCaseError(formatError(error));
    } finally {
      setSelectedCaseLoading(false);
    }
  }, []);

  const loadGovernanceDashboard = useCallback(async () => {
    setGovernanceBusy(true);
    setGovernanceError(null);
    try {
      const dashboard = await getGovernanceDashboard();
      setGovernanceDashboard(dashboard);
      if (!selectedTeamPublicId && dashboard.teams[0]) {
        setSelectedTeamPublicId(dashboard.teams[0].publicId);
      }
    } catch (error) {
      setGovernanceError(formatError(error));
    } finally {
      setGovernanceBusy(false);
    }
  }, [selectedTeamPublicId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [storedReporter, storedReviewer] = await Promise.all([
        getSecureJson<ReporterCredentials>(APP_STORAGE_KEYS.reporter),
        getSecureJson<ReviewerCredentials>(APP_STORAGE_KEYS.reviewer),
      ]);
      if (!mounted) return;
      if (storedReporter) setTrackForm(storedReporter);
      if (storedReviewer) {
        setReviewerCredentials(storedReviewer);
        if (storedReviewer.mode === "reviewer") {
          setReviewerLogin((current) => ({ ...current, email: storedReviewer.email, privateKey: storedReviewer.secret }));
        } else {
          setGovernanceForm((current) => ({ ...current, email: storedReviewer.email, password: storedReviewer.secret }));
        }
      }
      await refreshSession();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [fade, tab, reviewerSubTab, selectedCaseId, session?.role]);

  useEffect(() => {
    if (!session) return;
    if (session.role === "reviewer") {
      setTab("reviewer");
      setReviewerSubTab("login");
      void loadReviewerDashboard();
    }
    if (session.role === "administrator") {
      setTab("reviewer");
      setReviewerSubTab("governance");
      void loadGovernanceDashboard();
    }
  }, [loadGovernanceDashboard, loadReviewerDashboard, session]);

  useEffect(() => {
    if (reviewerDashboard?.cases[0] && !selectedCaseId) {
      setSelectedCaseId(reviewerDashboard.cases[0].id);
    }
  }, [reviewerDashboard, selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId || tab !== "reviewer" || reviewerSubTab !== "login") return;
    if (session?.role !== "reviewer") return;
    void loadSelectedCase(selectedCaseId);
  }, [loadSelectedCase, reviewerSubTab, selectedCaseId, session?.role, tab]);

  useEffect(() => {
    if (!governanceDashboard?.teams.length) return;
    if (!selectedTeamPublicId) setSelectedTeamPublicId(governanceDashboard.teams[0].publicId);
  }, [governanceDashboard, selectedTeamPublicId]);

  async function handleSubmitReport() {
    const validationError = validateReportForm(reportForm);
    if (validationError) {
      setReportError(validationError);
      return;
    }
    setReporting(true);
    setReportError(null);
    try {
      const receipt = await submitReport({
        reporterRole: reportForm.reporterRole,
        category: reportForm.category.trim(),
        urgency: reportForm.urgency,
        target: reportForm.target,
        department: reportForm.department.trim(),
        title: reportForm.title.trim(),
        description: reportForm.description.trim(),
        incidentDate: reportForm.incidentDate.trim(),
        location: reportForm.location.trim(),
        consent: true,
      });
      setReportReceipt(receipt);
      const nextCreds = {
        trackingCode: receipt.trackingCode,
        accessKey: receipt.accessKey,
      };
      setTrackForm(nextCreds);
      setReportedCase(await openCase(nextCreds).catch(() => null));
      await setSecureJson(APP_STORAGE_KEYS.reporter, nextCreds);
      Alert.alert("Report submitted", "Your tracking code and access key are saved securely.");
      setTab("track");
    } catch (error) {
      setReportError(formatError(error));
    } finally {
      setReporting(false);
    }
  }

  async function handleOpenCase() {
    const validationError = validateTrackForm(trackForm);
    if (validationError) {
      setTrackError(validationError);
      return;
    }
    setTracking(true);
    setTrackError(null);
    try {
      const snapshot = await openCase({
        trackingCode: trackForm.trackingCode.trim(),
        accessKey: trackForm.accessKey.trim(),
      });
      setTrackedCase(snapshot);
      setReporterReply("");
      await setSecureJson(APP_STORAGE_KEYS.reporter, {
        trackingCode: trackForm.trackingCode.trim(),
        accessKey: trackForm.accessKey.trim(),
      });
    } catch (error) {
      setTrackError(formatError(error));
    } finally {
      setTracking(false);
    }
  }

  async function handleLoadCurrentCase() {
    setTracking(true);
    setTrackError(null);
    try {
      const snapshot = await getCurrentCase();
      setTrackedCase(snapshot);
      setTrackForm({
        trackingCode: snapshot.trackingCode,
        accessKey: trackForm.accessKey || "",
      });
    } catch (error) {
      setTrackError(formatError(error));
    } finally {
      setTracking(false);
    }
  }

  async function handleSendReporterMessage() {
    if (!reporterReply.trim()) {
      setTrackError("Write a message first.");
      return;
    }
    setTracking(true);
    setTrackError(null);
    try {
      const snapshot = await sendReporterMessage(reporterReply.trim());
      setTrackedCase(snapshot);
      setReporterReply("");
    } catch (error) {
      setTrackError(formatError(error));
    } finally {
      setTracking(false);
    }
  }

  async function handleAddEvidence() {
    if (!trackedCase) {
      setTrackError("Open a case first.");
      return;
    }

    setEvidenceBusy(true);
    setEvidenceStatus("");
    setTrackError(null);

    try {
      const result = await File.pickFileAsync({
        multipleFiles: true,
        mimeTypes: EVIDENCE_MIME_TYPES,
      });

      if (result.canceled) return;

      const files = result.result;
      if (!files.length) return;

      const currentCount = trackedCase.evidenceCount ?? 0;
      if (currentCount + files.length > 5) {
        setTrackError("A case can contain up to five evidence files.");
        return;
      }

      let failed = 0;
      let uploaded = 0;

      for (const [index, file] of files.entries()) {
        const byteSize = file.size ?? 0;
        if (byteSize > 15 * 1024 * 1024) {
          failed += 1;
          continue;
        }

        const contentType = evidenceContentType(file);
        const pathname = `evidence/${createEvidenceId()}`;
        setEvidenceStatus(`Uploading ${index + 1} of ${files.length}…`);

        try {
          const clientToken = await requestEvidenceUploadToken({
            pathname,
            fileName: file.name,
            contentType,
            byteSize,
            multipart: byteSize > 4 * 1024 * 1024,
          });

          const uploadResponse = await file.upload(`${BLOB_API_URL}/?pathname=${encodeURIComponent(pathname)}`, {
            httpMethod: "PUT",
            headers: {
              authorization: `Bearer ${clientToken}`,
              "x-vercel-blob-access": "private",
              "x-content-type": contentType,
            },
            mimeType: contentType,
            onProgress: ({ bytesSent, totalBytes }) => {
              const total = totalBytes > 0 ? totalBytes : byteSize;
              const percentage = total > 0 ? Math.round((bytesSent / total) * 100) : 0;
              setEvidenceStatus(`Protecting file ${index + 1} of ${files.length} · ${percentage}%`);
            },
          });

          if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
            throw new Error("The file could not be stored securely.");
          }

          uploaded += 1;
        } catch {
          failed += 1;
        }
      }

      try {
        const refreshedCase = await getCurrentCase();
        setTrackedCase(refreshedCase);
      } catch {
        // Keep the current snapshot if refresh fails; the upload itself already completed.
      }

      if (uploaded > 0) {
        Alert.alert("Evidence uploaded", `${uploaded} file(s) were added privately to this case.`);
      }
      if (failed > 0) {
        setTrackError(`${failed} evidence file(s) could not be uploaded.`);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setTrackError(formatError(error));
      }
    } finally {
      setEvidenceBusy(false);
      setEvidenceStatus("");
    }
  }

  async function handleReviewerLogin() {
    if (!reviewerLogin.email.trim() || !reviewerLogin.privateKey.trim()) {
      Alert.alert("Missing details", "Enter the reviewer email and assigned private key.");
      return;
    }
    setReviewerDashboardError(null);
    setReviewerDashboardLoading(true);
    try {
      await loginReviewer({
        email: reviewerLogin.email.trim(),
        privateKey: reviewerLogin.privateKey.trim(),
      });
      await setSecureJson(APP_STORAGE_KEYS.reviewer, {
        mode: "reviewer",
        email: reviewerLogin.email.trim(),
        secret: reviewerLogin.privateKey.trim(),
      });
      await refreshSession();
      await loadReviewerDashboard();
    } catch (error) {
      setReviewerDashboardError(formatError(error));
    } finally {
      setReviewerDashboardLoading(false);
    }
  }

  async function handleReviewerRegister() {
    if (!reviewerRequest.name.trim() || !reviewerRequest.email.trim()) {
      Alert.alert("Missing details", "Enter the reviewer name and official email.");
      return;
    }
    setReviewerDashboardError(null);
    try {
      const result = await registerReviewer({
        name: reviewerRequest.name.trim(),
        email: reviewerRequest.email.trim(),
        department: reviewerRequest.department.trim(),
      });
      Alert.alert(
        "Request sent",
        `Request ${result.requestPublicId} is pending approval. Reviewer id: ${result.reviewerPublicId}.`,
      );
      setReviewerRequest(DEFAULT_REVIEWER_REQUEST);
    } catch (error) {
      setReviewerDashboardError(formatError(error));
    }
  }

  async function handleGovernanceBootstrap() {
    if (!governanceForm.email.trim() || governanceForm.password.trim().length < 14) {
      Alert.alert("Missing details", "Use an official email and a password with at least 14 characters.");
      return;
    }
    setBootstrapping(true);
    setGovernanceError(null);
    try {
      await bootstrapGovernance({
        email: governanceForm.email.trim(),
        password: governanceForm.password,
      });
      await setSecureJson(APP_STORAGE_KEYS.reviewer, {
        mode: "governance",
        email: governanceForm.email.trim(),
        secret: governanceForm.password,
      });
      await refreshSession();
      await loadGovernanceDashboard();
    } catch (error) {
      setGovernanceError(formatError(error));
    } finally {
      setBootstrapping(false);
    }
  }

  async function handleGovernanceLogin() {
    if (!governanceForm.email.trim() || !governanceForm.password.trim()) {
      Alert.alert("Missing details", "Enter the Dean or VC email and password.");
      return;
    }
    setBootstrapping(true);
    setGovernanceError(null);
    try {
      await loginReviewer({
        email: governanceForm.email.trim(),
        password: governanceForm.password,
      });
      await setSecureJson(APP_STORAGE_KEYS.reviewer, {
        mode: "governance",
        email: governanceForm.email.trim(),
        secret: governanceForm.password,
      });
      await refreshSession();
      await loadGovernanceDashboard();
    } catch (error) {
      setGovernanceError(formatError(error));
    } finally {
      setBootstrapping(false);
    }
  }

  async function handleCreateTeam() {
    if (!teamForm.label.trim()) {
      setGovernanceError("Give the team a short label.");
      return;
    }
    setGovernanceBusy(true);
    setGovernanceError(null);
    try {
      const result = await createGovernanceTeam({
        label: teamForm.label.trim(),
        teamType: teamForm.teamType,
      });
      setGovernanceResult(`Created ${result.publicId}: ${result.inviteCodes.join(" · ")}`);
      setTeamForm(DEFAULT_TEAM_FORM);
      await loadGovernanceDashboard();
    } catch (error) {
      setGovernanceError(formatError(error));
    } finally {
      setGovernanceBusy(false);
    }
  }

  async function handleGovernanceDecision(
    requestId: string,
    decision: "approve" | "reject",
    requestTeamPublicId: string | null,
  ) {
    setGovernanceBusy(true);
    setGovernanceError(null);
    try {
      const targetTeam =
        governanceDashboard?.teams.find((team) => team.publicId === requestTeamPublicId) ??
        selectedTeam;
      if (!targetTeam) {
        setGovernanceError("Create or select a team first.");
        return;
      }
      const targetTeamId = targetTeam.id;
      const targetSlot = targetTeam?.slots.find((slot) => !slot.assignedReviewerPublicId)?.slotNumber ?? 1;
      const result = await decideGovernanceRequest({
        requestId,
        decision,
        teamId: targetTeamId,
        slotNumber: targetSlot,
      });
      setGovernanceResult(
        result.status === "approved"
          ? `Approved. Slot ${result.slotNumber ?? targetSlot} assigned.`
          : "Request rejected.",
      );
      await loadGovernanceDashboard();
    } catch (error) {
      setGovernanceError(formatError(error));
    } finally {
      setGovernanceBusy(false);
    }
  }

  async function handleDeleteTeam(team: GovernanceTeam) {
    Alert.alert("Delete team?", "This only works for unused teams.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setGovernanceBusy(true);
          setGovernanceError(null);
          try {
            await deleteGovernanceTeam(team.id);
            if (selectedTeamPublicId === team.publicId) {
              setSelectedTeamPublicId(null);
            }
            await loadGovernanceDashboard();
          } catch (error) {
            setGovernanceError(formatError(error));
          } finally {
            setGovernanceBusy(false);
          }
        },
      },
    ]);
  }

  async function handleSelectCase(caseId: string) {
    setSelectedCaseId(caseId);
    if (session?.role === "reviewer") {
      await loadSelectedCase(caseId);
    }
  }

  async function handleCaseUpdate() {
    if (!selectedCaseId) return;
    setCaseActionBusy(true);
    setSelectedCaseError(null);
    try {
      const payload: {
        status?: string;
        priority?: number;
        note?: string;
      } = {};
      if (caseAction.status) payload.status = caseAction.status;
      if (Number.isFinite(caseAction.priority)) payload.priority = caseAction.priority;
      if (caseAction.note.trim()) payload.note = caseAction.note.trim();
      const updated = await updateReviewerCase(selectedCaseId, payload);
      setSelectedCase(updated);
      setCaseAction((current) => ({
        ...current,
        status: updated.status,
      }));
      await loadReviewerDashboard();
    } catch (error) {
      setSelectedCaseError(formatError(error));
    } finally {
      setCaseActionBusy(false);
    }
  }

  async function handleReviewerReply() {
    if (!selectedCaseId || !caseAction.reply.trim()) return;
    setCaseActionBusy(true);
    setSelectedCaseError(null);
    try {
      const updated = await sendReviewerMessage(selectedCaseId, caseAction.reply.trim());
      setSelectedCase(updated);
      setCaseAction((current) => ({ ...current, reply: "" }));
    } catch (error) {
      setSelectedCaseError(formatError(error));
    } finally {
      setCaseActionBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await removeSecureItem(APP_STORAGE_KEYS.reviewer);
      await refreshSession();
      setReviewerDashboard(null);
      setGovernanceDashboard(null);
      setSelectedCase(null);
      setSelectedCaseId(null);
      setGovernanceResult(null);
      setReviewerDashboardError(null);
      setGovernanceError(null);
      setReviewerSubTab("login");
      setTab("home");
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (tab !== "reviewer") return;
    if (session?.role === "reviewer" && reviewerDashboard?.cases?.length && !selectedCase) {
      void loadSelectedCase(selectedCaseId ?? reviewerDashboard.cases[0].id);
    }
  }, [loadSelectedCase, reviewerDashboard?.cases?.length, selectedCase, selectedCaseId, session?.role, tab]);

  useEffect(() => {
    if (tab !== "reviewer" || session?.role !== "administrator") return;
    if (!governanceDashboard) void loadGovernanceDashboard();
  }, [governanceDashboard, loadGovernanceDashboard, session?.role, tab]);

  const reviewerDashboardCases = reviewerDashboard?.cases ?? [];
  const governanceTeams = governanceDashboard?.teams ?? [];
  const governanceRequests = governanceDashboard?.requests ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.shell}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>SilentSignals</Text>
              <Text style={styles.subBrand}>{statusLabel}</Text>
            </View>
            <Pressable
              onPress={async () => {
                if (tab === "track") await handleLoadCurrentCase();
                if (tab === "reviewer") {
                  if (session?.role === "reviewer") await loadReviewerDashboard();
                  if (session?.role === "administrator") await loadGovernanceDashboard();
                }
              }}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerButtonText}>Refresh</Text>
            </Pressable>
          </View>

          <TabBar tab={tab} onChange={setTab} />

          <Animated.View
            style={[
              styles.content,
              {
                opacity: fade,
                transform: [
                  {
                    translateY: fade.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {tab === "home" ? (
              <ScrollView contentContainerStyle={styles.page}>
                <HomeScreen
                  reporterCase={reportedCase ?? trackedCase}
                  onGoReport={() => setTab("report")}
                  onGoTrack={() => setTab("track")}
                  onGoReviewer={() => setTab("reviewer")}
                  session={session}
                  onLogout={handleLogout}
                />
              </ScrollView>
            ) : null}

            {tab === "report" ? (
              <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                <ReportScreen
                  form={reportForm}
                  setForm={setReportForm}
                  loading={reporting}
                  error={reportError}
                  receipt={reportReceipt}
                  onSubmit={handleSubmitReport}
                />
              </ScrollView>
            ) : null}

            {tab === "track" ? (
              <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                <TrackScreen
                  form={trackForm}
                  setForm={setTrackForm}
                  loading={tracking}
                  error={trackError}
                  caseSnapshot={trackedCase}
                  reply={reporterReply}
                  setReply={setReporterReply}
                  onOpenCase={handleOpenCase}
                  onOpenCurrentCase={handleLoadCurrentCase}
                  onSendReply={handleSendReporterMessage}
                  onAddEvidence={handleAddEvidence}
                  evidenceBusy={evidenceBusy}
                  evidenceStatus={evidenceStatus}
                />
              </ScrollView>
            ) : null}

            {tab === "reviewer" ? (
              <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                <ReviewerScreen
                  session={session}
                  onLogout={handleLogout}
                  reviewerSubTab={reviewerSubTab}
                  setReviewerSubTab={setReviewerSubTab}
                  reviewerLogin={reviewerLogin}
                  setReviewerLogin={setReviewerLogin}
                  reviewerRequest={reviewerRequest}
                  setReviewerRequest={setReviewerRequest}
                  governanceForm={governanceForm}
                  setGovernanceForm={setGovernanceForm}
                  teamForm={teamForm}
                  setTeamForm={setTeamForm}
                  bootstrapping={bootstrapping}
                  onBootstrap={handleGovernanceBootstrap}
                  onGovernanceLogin={handleGovernanceLogin}
                  onReviewerLogin={handleReviewerLogin}
                  onReviewerRegister={handleReviewerRegister}
                  reviewerDashboard={reviewerDashboard}
                  reviewerDashboardLoading={reviewerDashboardLoading}
                  reviewerDashboardError={reviewerDashboardError}
                  selectedCaseId={selectedCaseId}
                  selectedCase={selectedCase}
                  selectedCaseLoading={selectedCaseLoading}
                  selectedCaseError={selectedCaseError}
                  caseAction={caseAction}
                  setCaseAction={setCaseAction}
                  onSelectCase={handleSelectCase}
                  onCaseUpdate={handleCaseUpdate}
                  onReply={handleReviewerReply}
                  caseActionBusy={caseActionBusy}
                  governanceDashboard={governanceDashboard}
                  governanceBusy={governanceBusy}
                  governanceError={governanceError}
                  governanceResult={governanceResult}
                  onCreateTeam={handleCreateTeam}
                  onDecision={handleGovernanceDecision}
                  onDeleteTeam={handleDeleteTeam}
                  selectedTeam={selectedTeam}
                  selectedTeamPublicId={selectedTeamPublicId}
                  setSelectedTeamPublicId={setSelectedTeamPublicId}
                  reviewerDashboardCases={reviewerDashboardCases}
                  governanceTeams={governanceTeams}
                  governanceRequests={governanceRequests}
                />
              </ScrollView>
            ) : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen(props: {
  reporterCase: CaseSnapshot | null;
  onGoReport: () => void;
  onGoTrack: () => void;
  onGoReviewer: () => void;
  session: ReviewerIdentity | null;
  onLogout: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Panel>
        <Text style={styles.eyebrow}>Independent and confidential reporting</Text>
        <Text style={styles.heroTitle}>SilentSignals mobile workspace</Text>
        <Text style={styles.body}>
          Submit a report, reopen a case, or work inside the reviewer and governance flows.
        </Text>
        <View style={styles.buttonRow}>
          <ActionButton label="Submit report" onPress={props.onGoReport} />
          <SecondaryButton label="Track a case" onPress={props.onGoTrack} />
        </View>
      </Panel>

      <View style={styles.grid}>
        <MetricCard title="Reporter" value="Anonymous case" detail="Create a protected report and keep your receipt." />
        <MetricCard title="Reviewer" value="Case queue" detail="Sign in with an assigned private key." />
        <MetricCard title="Dean / VC" value="Governance" detail="Bootstrap the first administrator or sign in normally." />
      </View>

      <Panel>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.stackSmall}>
          <SecondaryButton label="Open reviewer workspace" onPress={props.onGoReviewer} />
          {props.session ? (
            <SecondaryButton label="Sign out" onPress={props.onLogout} />
          ) : null}
          {props.reporterCase ? (
            <View style={styles.inlineCard}>
              <Text style={styles.inlineLabel}>Saved case</Text>
              <Text style={styles.inlineText}>{props.reporterCase.trackingCode}</Text>
            </View>
          ) : null}
        </View>
      </Panel>
    </View>
  );
}

function ReportScreen(props: {
  form: ReportFormState;
  setForm: Dispatch<SetStateAction<ReportFormState>>;
  loading: boolean;
  error: string | null;
  receipt: ReportReceipt | null;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Panel>
        <Text style={styles.eyebrow}>Submit report</Text>
        <Text style={styles.sectionTitle}>Create a protected case</Text>
        <Text style={styles.body}>The tracking code and access key are shown once after submission.</Text>
      </Panel>

      <Panel>
        <Text style={styles.fieldLabel}>Reporter role</Text>
        <ChipRow
          values={REPORTER_ROLES}
          value={props.form.reporterRole}
          onChange={(reporterRole) => props.setForm((current) => ({ ...current, reporterRole }))}
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <TextField
          value={props.form.category}
          onChangeText={(category) => props.setForm((current) => ({ ...current, category }))}
          placeholder="Harassment, safety, discrimination..."
        />

        <Text style={styles.fieldLabel}>Urgency</Text>
        <ChipRow
          values={URGENCY_LEVELS}
          value={props.form.urgency}
          onChange={(urgency) => props.setForm((current) => ({ ...current, urgency }))}
        />

        <Text style={styles.fieldLabel}>Routing target</Text>
        <ChipRow
          values={REPORT_TARGETS}
          value={props.form.target}
          onChange={(target) => props.setForm((current) => ({ ...current, target }))}
        />

        <Text style={styles.fieldLabel}>Department</Text>
        <TextField
          value={props.form.department}
          onChangeText={(department) => props.setForm((current) => ({ ...current, department }))}
          placeholder="Optional"
        />
      </Panel>

      <Panel>
        <Text style={styles.fieldLabel}>Title</Text>
        <TextField
          value={props.form.title}
          onChangeText={(title) => props.setForm((current) => ({ ...current, title }))}
          placeholder="Short, clear title"
        />

        <Text style={styles.fieldLabel}>Description</Text>
        <TextArea
          value={props.form.description}
          onChangeText={(description) => props.setForm((current) => ({ ...current, description }))}
          placeholder="Describe what happened in detail."
        />

        <View style={styles.twoColumn}>
          <View style={styles.flex1}>
            <Text style={styles.fieldLabel}>Incident date</Text>
            <TextField
              value={props.form.incidentDate}
              onChangeText={(incidentDate) => props.setForm((current) => ({ ...current, incidentDate }))}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextField
              value={props.form.location}
              onChangeText={(location) => props.setForm((current) => ({ ...current, location }))}
              placeholder="Optional"
            />
          </View>
        </View>

        <ToggleRow
          label="I confirm the report is accurate and I understand the privacy notice."
          value={props.form.consent}
          onChange={(consent) => props.setForm((current) => ({ ...current, consent }))}
        />
      </Panel>

      {props.error ? <Notice kind="danger" text={props.error} /> : null}

      <ActionButton label={props.loading ? "Submitting..." : "Submit report"} onPress={props.onSubmit} disabled={props.loading} />

      {props.receipt ? (
        <Panel>
          <Text style={styles.sectionTitle}>Receipt</Text>
          <InlineField label="Tracking code" value={props.receipt.trackingCode} />
          <InlineField label="Access key" value={props.receipt.accessKey} />
          <InlineField label="Status" value={props.receipt.status} />
        </Panel>
      ) : null}
    </View>
  );
}

function TrackScreen(props: {
  form: TrackFormState;
  setForm: Dispatch<SetStateAction<TrackFormState>>;
  loading: boolean;
  error: string | null;
  caseSnapshot: CaseSnapshot | null;
  reply: string;
  setReply: Dispatch<SetStateAction<string>>;
  onOpenCase: () => void;
  onOpenCurrentCase: () => void;
  onSendReply: () => void;
  onAddEvidence: () => void;
  evidenceBusy: boolean;
  evidenceStatus: string;
}) {
  return (
    <View style={styles.stack}>
      <Panel>
        <Text style={styles.eyebrow}>Track case</Text>
        <Text style={styles.sectionTitle}>Open a protected case</Text>
        <Text style={styles.body}>Use the receipt from report submission or reopen the current case session.</Text>
        <Text style={styles.fieldLabel}>Tracking code</Text>
        <TextField
          value={props.form.trackingCode}
          onChangeText={(trackingCode) => props.setForm((current) => ({ ...current, trackingCode }))}
          placeholder="SIG-2026-XXXX-XXXX"
          autoCapitalize="characters"
        />
        <Text style={styles.fieldLabel}>Access key</Text>
        <TextField
          value={props.form.accessKey}
          onChangeText={(accessKey) => props.setForm((current) => ({ ...current, accessKey }))}
          placeholder="16 characters"
          autoCapitalize="characters"
          secureTextEntry
        />
        <View style={styles.buttonRow}>
          <ActionButton label={props.loading ? "Opening..." : "Open case"} onPress={props.onOpenCase} disabled={props.loading} />
          <SecondaryButton label="Use current session" onPress={props.onOpenCurrentCase} disabled={props.loading} />
        </View>
      </Panel>

      {props.error ? <Notice kind="danger" text={props.error} /> : null}

      {props.caseSnapshot ? (
        <>
          <Panel>
            <Text style={styles.sectionTitle}>Case summary</Text>
            <InlineField label="Status" value={props.caseSnapshot.status} />
            <InlineField label="Route" value={props.caseSnapshot.route} />
            <InlineField label="Urgency" value={props.caseSnapshot.urgency} />
            <InlineField label="Category" value={props.caseSnapshot.report.category} />
            <InlineField label="Title" value={props.caseSnapshot.report.title} />
            <InlineField label="Evidence" value={`${props.caseSnapshot.evidenceCount}`} />
            <Text style={styles.fieldLabel}>Description</Text>
            <Text style={styles.body}>{props.caseSnapshot.report.description}</Text>
            <Text style={styles.fieldLabel}>Protected evidence</Text>
            <Text style={styles.mutedBody}>
              {props.evidenceStatus || "Private files remain restricted to this case."}
            </Text>
            <View style={styles.buttonRow}>
              <ActionButton
                label={props.evidenceBusy ? "Uploading..." : "Add evidence"}
                onPress={props.onAddEvidence}
                disabled={props.evidenceBusy}
              />
            </View>
            {props.caseSnapshot.evidence.length ? (
              <View style={styles.stack}>
                {props.caseSnapshot.evidence.map((file) => (
                  <View key={file.id} style={styles.inlineCard}>
                    <Text style={styles.inlineLabel}>{file.name}</Text>
                    <Text style={styles.body}>
                      {formatBytes(file.byteSize)} · {file.status}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedBody}>No evidence attached yet.</Text>
            )}
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Messages</Text>
            {props.caseSnapshot.messages.length ? (
              props.caseSnapshot.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            ) : (
              <Text style={styles.mutedBody}>No messages yet.</Text>
            )}
            <Text style={styles.fieldLabel}>Reply</Text>
            <TextArea
              value={props.reply}
              onChangeText={props.setReply}
              placeholder="Write a short update for the reviewer."
            />
            <ActionButton label={props.loading ? "Sending..." : "Send reply"} onPress={props.onSendReply} disabled={props.loading} />
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Events</Text>
            {props.caseSnapshot.events.length ? (
              props.caseSnapshot.events.map((event) => (
                <View key={event.id} style={styles.listRow}>
                  <Text style={styles.listPrimary}>{event.type}</Text>
                  <Text style={styles.listSecondary}>{event.status}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.mutedBody}>No timeline entries yet.</Text>
            )}
          </Panel>
        </>
      ) : null}
    </View>
  );
}

function ReviewerScreen(props: {
  session: ReviewerIdentity | null;
  onLogout: () => void;
  reviewerSubTab: ReviewerSubTab;
  setReviewerSubTab: Dispatch<SetStateAction<ReviewerSubTab>>;
  reviewerLogin: ReviewerLoginForm;
  setReviewerLogin: Dispatch<SetStateAction<ReviewerLoginForm>>;
  reviewerRequest: ReviewerRequestForm;
  setReviewerRequest: Dispatch<SetStateAction<ReviewerRequestForm>>;
  governanceForm: GovernanceForm;
  setGovernanceForm: Dispatch<SetStateAction<GovernanceForm>>;
  teamForm: TeamForm;
  setTeamForm: Dispatch<SetStateAction<TeamForm>>;
  bootstrapping: boolean;
  onBootstrap: () => void;
  onGovernanceLogin: () => void;
  onReviewerLogin: () => void;
  onReviewerRegister: () => void;
  reviewerDashboard: ReviewerDashboard | null;
  reviewerDashboardLoading: boolean;
  reviewerDashboardError: string | null;
  selectedCaseId: string | null;
  selectedCase: ReviewerCaseDetail | null;
  selectedCaseLoading: boolean;
  selectedCaseError: string | null;
  caseAction: CaseActionForm;
  setCaseAction: Dispatch<SetStateAction<CaseActionForm>>;
  onSelectCase: (caseId: string) => void;
  onCaseUpdate: () => void;
  onReply: () => void;
  caseActionBusy: boolean;
  governanceDashboard: GovernanceDashboard | null;
  governanceBusy: boolean;
  governanceError: string | null;
  governanceResult: string | null;
  onCreateTeam: () => void;
  onDecision: (requestId: string, decision: "approve" | "reject", teamPublicId: string | null) => void;
  onDeleteTeam: (team: GovernanceTeam) => void;
  selectedTeam: GovernanceTeam | null;
  selectedTeamPublicId: string | null;
  setSelectedTeamPublicId: Dispatch<SetStateAction<string | null>>;
  reviewerDashboardCases: ReviewerCaseSummary[];
  governanceTeams: GovernanceTeam[];
  governanceRequests: GovernanceDashboard["requests"];
}) {
  const showAdminWorkspace = props.session?.role === "administrator";
  const showReviewerWorkspace = props.session?.role === "reviewer";

  return (
    <View style={styles.stack}>
      <Panel>
        <Text style={styles.eyebrow}>Reviewer gateway</Text>
        <Text style={styles.sectionTitle}>Workspace access</Text>
        <SegmentedControl
          value={props.reviewerSubTab}
          options={[
            { key: "login", label: "Reviewer" },
            { key: "request", label: "Request access" },
            { key: "governance", label: "Dean / VC" },
          ]}
          onChange={(value) => props.setReviewerSubTab(value as ReviewerSubTab)}
        />
      </Panel>

      {!showAdminWorkspace && props.reviewerSubTab === "governance" ? (
        <>
          <Panel>
            <Text style={styles.sectionTitle}>Bootstrap the first Dean / VC</Text>
            <Text style={styles.body}>This creates the first administrator account and signs in immediately.</Text>
            <Text style={styles.fieldLabel}>Official email</Text>
            <TextField
              value={props.governanceForm.email}
              onChangeText={(email) => props.setGovernanceForm((current) => ({ ...current, email }))}
              placeholder="dean@university.edu"
            />
            <Text style={styles.fieldLabel}>Password</Text>
            <TextField
              value={props.governanceForm.password}
              onChangeText={(password) => props.setGovernanceForm((current) => ({ ...current, password }))}
              placeholder="At least 14 characters"
              secureTextEntry
            />
            <View style={styles.buttonRow}>
              <ActionButton
                label={props.bootstrapping ? "Creating..." : "Create first account"}
                onPress={props.onBootstrap}
                disabled={props.bootstrapping}
              />
              <SecondaryButton
                label={props.bootstrapping ? "Signing in..." : "Sign in"}
                onPress={props.onGovernanceLogin}
                disabled={props.bootstrapping}
              />
            </View>
          </Panel>
          {props.governanceError ? <Notice kind="danger" text={props.governanceError} /> : null}
        </>
      ) : null}

      {props.reviewerSubTab === "login" && !showReviewerWorkspace ? (
        <Panel>
          <Text style={styles.sectionTitle}>Reviewer sign in</Text>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextField
            value={props.reviewerLogin.email}
            onChangeText={(email) => props.setReviewerLogin((current) => ({ ...current, email }))}
            placeholder="reviewer@university.edu"
          />
          <Text style={styles.fieldLabel}>Private key</Text>
          <TextField
            value={props.reviewerLogin.privateKey}
            onChangeText={(privateKey) =>
              props.setReviewerLogin((current) => ({ ...current, privateKey }))
            }
            placeholder="SS-XXXX-XXXX"
            autoCapitalize="characters"
            secureTextEntry
          />
          <ActionButton label="Open reviewer workspace" onPress={props.onReviewerLogin} />
          {props.reviewerDashboardError ? <Notice kind="danger" text={props.reviewerDashboardError} /> : null}
        </Panel>
      ) : null}

      {props.reviewerSubTab === "request" && !showReviewerWorkspace ? (
        <Panel>
          <Text style={styles.sectionTitle}>Request protected reviewer access</Text>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextField
            value={props.reviewerRequest.name}
            onChangeText={(name) => props.setReviewerRequest((current) => ({ ...current, name }))}
            placeholder="Reviewer name"
          />
          <Text style={styles.fieldLabel}>Official email</Text>
          <TextField
            value={props.reviewerRequest.email}
            onChangeText={(email) => props.setReviewerRequest((current) => ({ ...current, email }))}
            placeholder="reviewer@university.edu"
          />
          <Text style={styles.fieldLabel}>Department</Text>
          <TextField
            value={props.reviewerRequest.department}
            onChangeText={(department) =>
              props.setReviewerRequest((current) => ({ ...current, department }))
            }
            placeholder="Optional"
          />
          <ActionButton label="Submit request" onPress={props.onReviewerRegister} />
          {props.reviewerDashboardError ? <Notice kind="danger" text={props.reviewerDashboardError} /> : null}
        </Panel>
      ) : null}

      {showReviewerWorkspace ? (
        <>
          <Panel>
            <Text style={styles.sectionTitle}>Reviewer workspace</Text>
            <InlineField label="Name" value={props.session?.displayName ?? ""} />
            <InlineField label="Role" value={props.session?.role ?? ""} />
            <InlineField label="Scope" value={props.session?.routeScope ?? ""} />
            <SecondaryButton label="Sign out" onPress={props.onLogout} />
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Case queue</Text>
            {props.reviewerDashboardLoading ? <Text style={styles.mutedBody}>Loading cases...</Text> : null}
            {props.reviewerDashboardError ? <Notice kind="danger" text={props.reviewerDashboardError} /> : null}
            {props.reviewerDashboard?.metrics ? (
              <View style={styles.grid}>
                <MetricCard title="Total" value={`${props.reviewerDashboard.metrics.total}`} detail="Cases in scope" />
                <MetricCard title="Urgent" value={`${props.reviewerDashboard.metrics.urgent}`} detail="Escalated items" />
                <MetricCard title="Unassigned" value={`${props.reviewerDashboard.metrics.unassigned}`} detail="Need routing" />
              </View>
            ) : null}
            {props.reviewerDashboardCases.length ? (
              props.reviewerDashboardCases.map((caseItem) => (
                <Pressable
                  key={caseItem.id}
                  onPress={() => props.onSelectCase(caseItem.id)}
                  style={({ pressed }) => [
                    styles.listCard,
                    props.selectedCaseId === caseItem.id && styles.listCardActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.listPrimary}>{caseItem.title}</Text>
                  <Text style={styles.listSecondary}>
                    {caseItem.trackingCode} · {caseItem.status} · {caseItem.urgency}
                  </Text>
                  <Text style={styles.listSecondary}>{caseItem.category}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.mutedBody}>No assigned cases yet.</Text>
            )}
          </Panel>

          {props.selectedCase ? (
            <Panel>
              <Text style={styles.sectionTitle}>Case detail</Text>
              {props.selectedCaseLoading ? <Text style={styles.mutedBody}>Loading case...</Text> : null}
              {props.selectedCaseError ? <Notice kind="danger" text={props.selectedCaseError} /> : null}
              <InlineField label="Tracking" value={props.selectedCase.trackingCode} />
              <InlineField label="Route" value={props.selectedCase.route} />
              <InlineField label="Status" value={props.selectedCase.status} />
              <InlineField label="Team" value={props.selectedCase.assignedTeamLabel ?? "Unassigned"} />
              <Text style={styles.fieldLabel}>Update status</Text>
              <ChipRow
                values={REVIEWER_STATUS_OPTIONS}
                value={props.caseAction.status}
                onChange={(status) => props.setCaseAction((current) => ({ ...current, status }))}
              />
              <Text style={styles.fieldLabel}>Priority</Text>
              <ChipRow
                values={["1", "2", "3", "4"]}
                value={`${props.caseAction.priority}`}
                onChange={(priority) =>
                  props.setCaseAction((current) => ({ ...current, priority: Number(priority) }))
                }
              />
              <Text style={styles.fieldLabel}>Internal note</Text>
              <TextArea
                value={props.caseAction.note}
                onChangeText={(note) => props.setCaseAction((current) => ({ ...current, note }))}
                placeholder="Private note for your team"
              />
              <View style={styles.buttonRow}>
                <ActionButton label={props.caseActionBusy ? "Saving..." : "Save update"} onPress={props.onCaseUpdate} disabled={props.caseActionBusy} />
              </View>

              {props.selectedCase.canReply ? (
                <>
                  <Text style={styles.fieldLabel}>Reply to reporter</Text>
                  <TextArea
                    value={props.caseAction.reply}
                    onChangeText={(reply) => props.setCaseAction((current) => ({ ...current, reply }))}
                    placeholder="Write the lead response"
                  />
                  <ActionButton
                    label={props.caseActionBusy ? "Sending..." : "Send reply"}
                    onPress={props.onReply}
                    disabled={props.caseActionBusy}
                  />
                </>
              ) : (
                <Text style={styles.mutedBody}>Only the lead reviewer can reply to the reporter.</Text>
              )}

              <Text style={styles.fieldLabel}>Internal notes</Text>
              {props.selectedCase.internalNotes.length ? (
                props.selectedCase.internalNotes.map((note) => (
                  <View key={note.id} style={styles.inlineCard}>
                    <Text style={styles.inlineLabel}>{note.authorPublicId}</Text>
                    <Text style={styles.body}>{note.body}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedBody}>No internal notes yet.</Text>
              )}
            </Panel>
          ) : null}
        </>
      ) : null}

      {props.session?.role === "administrator" ? (
        <>
          <Panel>
            <Text style={styles.sectionTitle}>Governance dashboard</Text>
            {props.governanceBusy ? <Text style={styles.mutedBody}>Loading governance data...</Text> : null}
            {props.governanceError ? <Notice kind="danger" text={props.governanceError} /> : null}
            {props.governanceResult ? <Notice kind="info" text={props.governanceResult} /> : null}
            {props.governanceDashboard?.metrics ? (
              <View style={styles.grid}>
                <MetricCard title="Teams" value={`${props.governanceDashboard.metrics.teams}`} detail="Created groups" />
                <MetricCard title="Active" value={`${props.governanceDashboard.metrics.activeTeams}`} detail="Live teams" />
                <MetricCard title="Pending" value={`${props.governanceDashboard.metrics.pendingApprovals}`} detail="Approval requests" />
              </View>
            ) : null}
            <Text style={styles.fieldLabel}>Current team</Text>
            <ChipRow
              values={props.governanceTeams.map((team) => team.publicId)}
              value={props.selectedTeamPublicId ?? ""}
              onChange={(publicId) => props.setSelectedTeamPublicId(publicId)}
            />
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Create team</Text>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextField
              value={props.teamForm.label}
              onChangeText={(label) => props.setTeamForm((current) => ({ ...current, label }))}
              placeholder="Ethics Reviewer A"
            />
            <Text style={styles.fieldLabel}>Type</Text>
            <ChipRow
              values={["committee", "independent_oversight"]}
              value={props.teamForm.teamType}
              onChange={(teamType) =>
                props.setTeamForm((current) => ({
                  ...current,
                  teamType: teamType as TeamForm["teamType"],
                }))
              }
            />
            <ActionButton label="Create team + 5 slots" onPress={props.onCreateTeam} />
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Requests</Text>
            {props.governanceRequests.length ? (
              props.governanceRequests.map((request) => (
                <View key={request.id} style={styles.listCard}>
                  <Text style={styles.listPrimary}>{request.reviewerName}</Text>
                  <Text style={styles.listSecondary}>{request.reviewerEmail}</Text>
                  <Text style={styles.listSecondary}>
                    {request.status} · {request.teamLabel ?? "No team yet"}
                  </Text>
                  {request.status === "pending" ? (
                    <View style={styles.buttonRow}>
                      <SecondaryButton
                        label="Approve"
                        onPress={() =>
                          props.onDecision(request.id, "approve", request.teamPublicId)
                        }
                        disabled={props.governanceBusy}
                      />
                      <SecondaryButton
                        label="Reject"
                        onPress={() =>
                          props.onDecision(request.id, "reject", request.teamPublicId)
                        }
                        disabled={props.governanceBusy}
                      />
                    </View>
                  ) : null}
                  {request.privateKey ? (
                    <InlineField label="Private key" value={request.privateKey} />
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.mutedBody}>No registration requests yet.</Text>
            )}
          </Panel>

          <Panel>
            <Text style={styles.sectionTitle}>Teams</Text>
            {props.governanceTeams.length ? (
              props.governanceTeams.map((team) => (
                <View key={team.id} style={styles.listCard}>
                  <Text style={styles.listPrimary}>{team.label}</Text>
                  <Text style={styles.listSecondary}>
                    {team.publicId} · {team.teamType} · {team.memberCount}/{team.capacity}
                  </Text>
                  <View style={styles.slotGrid}>
                    {team.slots.map((slot) => (
                      <View key={slot.slotNumber} style={styles.slotCard}>
                        <Text style={styles.slotLabel}>Seat {slot.slotNumber}</Text>
                        <Text style={styles.slotValue}>{slot.privateKey ?? "Open seat"}</Text>
                        <Text style={styles.slotMeta}>{slot.assignedReviewerEmail ?? "Invite required"}</Text>
                      </View>
                    ))}
                  </View>
                  <SecondaryButton
                    label="Delete unused team"
                    onPress={() => props.onDeleteTeam(team)}
                    disabled={team.memberCount > 0 || props.governanceBusy}
                  />
                </View>
              ))
            ) : (
              <Text style={styles.mutedBody}>No teams yet.</Text>
            )}
          </Panel>
        </>
      ) : null}
    </View>
  );
}

function TabBar(props: {
  tab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  const options: { key: MainTab; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "report", label: "Report" },
    { key: "track", label: "Track" },
    { key: "reviewer", label: "Reviewer" },
  ];
  return (
    <View style={styles.tabBar}>
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => props.onChange(option.key)}
          style={({ pressed }) => [
            styles.tabButton,
            props.tab === option.key && styles.tabButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.tabButtonText, props.tab === option.key && styles.tabButtonTextActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Panel(props: { children: ReactNode }) {
  return <View style={styles.panel}>{props.children}</View>;
}

function ActionButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        props.disabled && styles.buttonDisabled,
        pressed && !props.disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function SecondaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        props.disabled && styles.buttonDisabled,
        pressed && !props.disabled && styles.pressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function MetricCard(props: { title: string; value: string; detail: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricTitle}>{props.title}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
      <Text style={styles.metricDetail}>{props.detail}</Text>
    </View>
  );
}

function InlineField(props: { label: string; value: string }) {
  return (
    <View style={styles.inlineField}>
      <Text style={styles.inlineLabel}>{props.label}</Text>
      <Text style={styles.inlineText}>{props.value || "—"}</Text>
    </View>
  );
}

function TextField(props: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={COLORS.muted}
      secureTextEntry={props.secureTextEntry}
      autoCapitalize={props.autoCapitalize ?? "none"}
      style={styles.input}
    />
  );
}

function TextArea(props: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={COLORS.muted}
      multiline
      numberOfLines={6}
      textAlignVertical="top"
      style={[styles.input, styles.textArea]}
    />
  );
}

function ChipRow<T extends string>(props: {
  value: T | string;
  values: readonly T[] | string[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {props.values.map((value) => (
        <Pressable
          key={value}
          onPress={() => props.onChange(value as T)}
          style={({ pressed }) => [
            styles.chip,
            props.value === value && styles.chipActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.chipText, props.value === value && styles.chipTextActive]}>
            {value.replaceAll("_", " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SegmentedControl<T extends string>(props: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedControl}>
      {props.options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => props.onChange(option.key)}
          style={({ pressed }) => [
            styles.segmentedOption,
            props.value === option.key && styles.segmentedOptionActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.segmentedText,
              props.value === option.key && styles.segmentedTextActive,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ToggleRow(props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => props.onChange(!props.value)}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, props.value && styles.checkboxActive]}>
        <Text style={styles.checkboxText}>{props.value ? "✓" : ""}</Text>
      </View>
      <Text style={styles.toggleLabel}>{props.label}</Text>
    </Pressable>
  );
}

function Notice(props: { kind: "danger" | "info"; text: string }) {
  return (
    <View style={[styles.notice, props.kind === "danger" ? styles.noticeDanger : styles.noticeInfo]}>
      <Text style={styles.noticeText}>{props.text}</Text>
    </View>
  );
}

function MessageBubble(props: { message: ReporterMessage }) {
  const isReporter = props.message.sender === "reporter";
  return (
    <View style={[styles.messageBubble, isReporter ? styles.messageReporter : styles.messageReviewer]}>
      <Text style={styles.messageMeta}>
        {isReporter ? "Reporter" : "Reviewer"} · {formatTimestamp(props.message.createdAt)}
      </Text>
      <Text style={styles.body}>{props.message.body}</Text>
    </View>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function validateReportForm(form: ReportFormState) {
  if (form.category.trim().length < 3) return "Category must be at least 3 characters.";
  if (form.title.trim().length < 10) return "Title must be at least 10 characters.";
  if (form.description.trim().length < 80) return "Description must be at least 80 characters.";
  if (form.incidentDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.incidentDate.trim())) {
    return "Incident date must use YYYY-MM-DD.";
  }
  if (!form.consent) return "Please confirm the privacy notice.";
  return null;
}

function validateTrackForm(form: TrackFormState) {
  if (!form.trackingCode.trim()) return "Tracking code is required.";
  if (!form.accessKey.trim()) return "Access key is required.";
  return null;
}

function formatError(error: unknown) {
  if (error instanceof ApiError) {
    return error.message || error.code;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  shell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  brand: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.ink,
  },
  subBrand: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 13,
  },
  headerButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerButtonText: {
    color: COLORS.green,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },
  tabButtonActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  tabButtonText: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 13,
  },
  tabButtonTextActive: {
    color: COLORS.panel,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: COLORS.panelSoft,
    padding: 4,
    gap: 4,
  },
  segmentedOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  segmentedOptionActive: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentedText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  segmentedTextActive: {
    color: COLORS.green,
  },
  content: {
    flex: 1,
  },
  page: {
    paddingBottom: 24,
    gap: 12,
  },
  stack: {
    gap: 12,
  },
  stackSmall: {
    gap: 8,
  },
  panel: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  eyebrow: {
    color: COLORS.green,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    color: COLORS.ink,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: COLORS.ink,
    fontWeight: "800",
  },
  body: {
    color: COLORS.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  mutedBody: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: "700",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    backgroundColor: COLORS.panel,
    color: COLORS.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 130,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 999,
    backgroundColor: COLORS.panel,
  },
  chipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  chipText: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 13,
  },
  chipTextActive: {
    color: COLORS.panel,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: COLORS.panel,
  },
  checkboxActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  checkboxText: {
    color: COLORS.panel,
    fontWeight: "800",
  },
  toggleLabel: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: COLORS.panel,
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  secondaryButtonText: {
    color: COLORS.green,
    fontWeight: "800",
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panelSoft,
    padding: 14,
    gap: 6,
  },
  metricTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: COLORS.muted,
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 20,
    color: COLORS.ink,
    fontWeight: "800",
  },
  metricDetail: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  inlineCard: {
    borderRadius: 14,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 6,
  },
  inlineField: {
    gap: 4,
  },
  inlineLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    color: COLORS.muted,
    fontWeight: "700",
  },
  inlineText: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  flex1: {
    flexGrow: 1,
    flexBasis: "48%",
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    padding: 14,
    gap: 8,
  },
  listCardActive: {
    borderColor: COLORS.green,
    backgroundColor: "#f2fbf5",
  },
  listRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 2,
  },
  listPrimary: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  listSecondary: {
    color: COLORS.muted,
    fontSize: 13,
  },
  notice: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  noticeDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: "#efb4a9",
  },
  noticeInfo: {
    backgroundColor: COLORS.info,
    borderColor: "#bdd6e4",
  },
  noticeText: {
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    gap: 6,
    marginBottom: 8,
    borderWidth: 1,
  },
  messageReporter: {
    backgroundColor: "#f7faf3",
    borderColor: COLORS.border,
  },
  messageReviewer: {
    backgroundColor: "#edf6f3",
    borderColor: COLORS.borderStrong,
  },
  messageMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotCard: {
    flexGrow: 1,
    flexBasis: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panelSoft,
    padding: 10,
    gap: 4,
  },
  slotLabel: {
    color: COLORS.muted,
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  slotValue: {
    color: COLORS.ink,
    fontWeight: "800",
    fontSize: 13,
  },
  slotMeta: {
    color: COLORS.muted,
    fontSize: 12,
  },
});
