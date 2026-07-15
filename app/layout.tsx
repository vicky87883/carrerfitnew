import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarrerFit.com | Career clarity platform",
  description:
    "CarrerFit.com helps people map strengths, skills, and preferences to practical career paths.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
