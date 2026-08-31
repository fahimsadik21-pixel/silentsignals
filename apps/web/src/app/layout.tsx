import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SilentSignals",
    template: "%s | SilentSignals",
  },
  description:
    "A privacy-first reporting and case-tracking platform for safer institutions.",
  icons: {
    icon: [{ url: "/icon?v=2", type: "image/png" }],
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
