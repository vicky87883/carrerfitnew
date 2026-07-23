import type { Metadata } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/site";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: { default: "CarrerFit.com | Career clarity platform", template: "%s" },
  description:
    "CarrerFit.com helps people map strengths, skills, and preferences to practical career paths.",
  applicationName: "CarrerFit.com",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "CarrerFit.com", url: "/", title: "CarrerFit.com | Career clarity platform", description: "AI-powered resume matching, interview practice, career guidance, and verified job opportunities." },
  twitter: { card: "summary_large_image", title: "CarrerFit.com | Career clarity platform", description: "Build a clearer, evidence-backed career move." },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render each document against the active deployment so CDN HTML can never
  // outlive the content-hashed CSS and JavaScript files it references.
  await connection();
  return (
    <html lang="en">
      <body><AnalyticsTracker/>{children}</body>
    </html>
  );
}
