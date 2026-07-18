import { Suspense } from "react";
import AuthCard from "@/components/AuthCard";
export const metadata = { referrer: "no-referrer" };
export default function ResetPasswordPage() { return <Suspense><AuthCard mode="reset"/></Suspense>; }
