import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarrerFit.com | Career clarity platform",
  description:
    "CarrerFit.com helps people map strengths, skills, and preferences to practical career paths.",
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
      <body>{children}</body>
    </html>
  );
}
