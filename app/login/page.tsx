import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
export const metadata: Metadata = { title: "Sign in | CarrerFit", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export default function LoginPage() { return <Suspense><AuthCard mode="login"/></Suspense>; }
