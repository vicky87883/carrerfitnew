"use client";

import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import AppNav from "./AppNav";

type Mode = "login" | "register" | "forgot" | "reset";
const content = {
  login: { eyebrow: "Welcome back", title: "Open your private career workspace", copy: "Sign in to access your resume analysis, matches, saved roles, and interview practice." },
  register: { eyebrow: "Create your account", title: "Your career data deserves a secure home", copy: "Confirm your email before your private CarrerFit dashboard is activated." },
  forgot: { eyebrow: "Account recovery", title: "Reset your password securely", copy: "We’ll send a single-use link if an account exists for that email." },
  reset: { eyebrow: "Choose a new password", title: "Secure your CarrerFit account", copy: "This reset link is single-use and expires after 30 minutes." },
};

export default function AuthCard({ mode }: { mode: Mode }) {
  const search = useSearchParams(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(verificationMessage(search.get("verification"))); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const path = mode === "forgot" ? "forgot-password" : mode === "reset" ? "reset-password" : mode;
    if (mode === "reset") values.token = search.get("token") || "";
    if (mode === "login") values.next = search.get("next") || "/dashboard";
    try {
      const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json().catch(() => ({ message: "Request failed." }));
      if (!response.ok) throw new Error(body.message);
      setMessage(body.message || "Done.");
      if (mode === "login") window.location.assign(body.next || "/dashboard");
      if (mode === "reset") window.setTimeout(() => window.location.assign("/login?reset=success"), 800);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const info = content[mode];
  return <main className="authPage"><AppNav light/><section className="authLayout">
    <div className="authIntro"><span className="kicker">{info.eyebrow}</span><h1>{info.title}</h1><p>{info.copy}</p><div className="authTrust"><span><ShieldCheck/>Encrypted, account-isolated storage</span><span><LockKeyhole/>Secure, server-only session cookies</span><span><Mail/>Verified email ownership</span></div></div>
    <article className="authCard"><div className="authCardIcon"><ShieldCheck/></div><h2>{mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}</h2>
      {message && <div className="authNotice success"><CheckCircle2/>{message}</div>}{error && <div className="authNotice error">{error}</div>}
      <form onSubmit={submit}>
        {mode === "register" && <label><span>Full name</span><div><UserRound/><input name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Your name"/></div></label>}
        {mode !== "reset" && <label><span>Email address</span><div><Mail/><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></div></label>}
        {(mode === "login" || mode === "register" || mode === "reset") && <label><span>{mode === "reset" ? "New password" : "Password"}</span><div><LockKeyhole/><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} required placeholder="12+ characters"/></div>{mode !== "login" && <small>Use 12+ characters with uppercase, lowercase, and a number.</small>}</label>}
        {mode === "login" && <Link className="authSmallLink" href="/forgot-password">Forgot password?</Link>}
        <button disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <>{mode === "login" ? "Sign in securely" : mode === "register" ? "Create secure account" : mode === "forgot" ? "Send reset link" : "Update password"}<ArrowRight/></>}</button>
      </form>
      <p className="authSafety">CarrerFit only accepts account passwords on <strong>carrerfit.com</strong>. We never ask you to install software, provide payment details, or share a verification code.</p>
      <footer>{mode === "login" ? <>New to CarrerFit? <Link href="/register">Create an account</Link></> : mode === "register" ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>Remember your password? <Link href="/login">Back to sign in</Link></>}</footer>
    </article>
  </section></main>;
}
function verificationMessage(value: string | null) { if (value === "invalid") return "That confirmation link is invalid or expired. Request a new one from sign in."; return ""; }
