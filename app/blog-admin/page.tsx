import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import BlogAdmin from "@/components/BlogAdmin";
export const metadata: Metadata = { title: "Article publishing | CarrerFit", robots: { index: false, follow: false, nocache: true } };
export default function BlogAdminPage() { return <main className="sourceApp"><AppNav light/><BlogAdmin/></main>; }
