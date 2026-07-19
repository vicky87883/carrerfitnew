import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
export const metadata: Metadata = { title: "Password recovery | CarrerFit", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export default function ForgotPasswordPage() { return <Suspense><AuthCard mode="forgot"/></Suspense>; }
