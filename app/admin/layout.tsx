import type { Metadata } from "next";

export const metadata: Metadata = { title: "Administration | CarrerFit", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
