import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sakhaa Forge",
  description:
    "A V0 production workflow for brand intake, creative generation, approval, publishing and verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
