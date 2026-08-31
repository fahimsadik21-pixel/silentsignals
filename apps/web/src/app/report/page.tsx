import type { Metadata } from "next";
import { ReportWizard } from "@/features/report/report-wizard";

export const metadata: Metadata = {
  title: "Submit a report",
  description:
    "Create a private report without sharing personal identifying information.",
};

export default function ReportPage() {
  return <ReportWizard />;
}
