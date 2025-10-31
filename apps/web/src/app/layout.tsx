import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "San Qin Noodle House",
  description:
    "San Qin Noodle House online ordering experience with Clover checkout integration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
