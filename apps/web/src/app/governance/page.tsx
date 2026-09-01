import type { Metadata } from "next";
import { ReviewerWorkspace } from "@/features/reviewer/reviewer-workspace";

export const metadata: Metadata = {
  title: "Dean / VC governance",
  description: "Restricted SilentSignals reviewer governance and approval workspace.",
};

export default function GovernancePage() {
  return <ReviewerWorkspace initialAuthMode="governance" />;
}
