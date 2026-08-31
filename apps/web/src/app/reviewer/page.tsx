import type { Metadata } from "next";
import { ReviewerWorkspace } from "@/features/reviewer/reviewer-workspace";

export const metadata: Metadata = {
  title: "Reviewer workspace",
  description: "Restricted SilentSignals case review and response workspace.",
};

export default function ReviewerPage() {
  return <ReviewerWorkspace />;
}
