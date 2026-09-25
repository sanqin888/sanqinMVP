import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SanQ Customer Display",
  description: "Read-only customer-facing display for the SanQ POS workstation.",
  manifest: null,
  appleWebApp: {
    capable: false,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function CustomerDisplayLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
