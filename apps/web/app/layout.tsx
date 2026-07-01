import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sakhaa Forge | Evidence-first video creation",
  description:
    "Sakhaa Forge helps India-first real-estate teams move from approved brand truth to verified publication with retained evidence, cost records and lineage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
