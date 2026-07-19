import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
export const metadata: Metadata = { title: "Choose a new password | CarrerFit", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export default function ResetPasswordPage() { return <Suspense><AuthCard mode="reset"/></Suspense>; }
