import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
export const metadata: Metadata = { title: "Create an account | CarrerFit", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export default function RegisterPage() { return <Suspense><AuthCard mode="register"/></Suspense>; }
