import type { Metadata } from "next";
import { CaseAccess } from "@/features/track/case-access";

export const metadata: Metadata = {
  title: "Track a case",
  description: "Privately return to a SilentSignals case using secure case credentials.",
};

export default function TrackPage() {
  return <CaseAccess />;
}
