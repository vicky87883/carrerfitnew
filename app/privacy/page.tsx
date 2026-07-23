import type { Metadata } from "next";
import Link from "next/link";
import AppNav from "@/components/AppNav";

export const metadata: Metadata = {
  title: "Privacy and data use | CarrerFit",
  description: "How CarrerFit processes account, resume, interview, and application data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <main className="appShell"><AppNav light/><article className="legalPage">
    <span className="kicker">Privacy and data use</span><h1>Your career data should be handled plainly.</h1>
    <p className="legalLead">This notice explains what CarrerFit processes, why it is needed, and the controls applied to private resume and account data. Last updated 23 July 2026.</p>
    <section><h2>Information you provide</h2><p>We process account details, uploaded PDF or DOCX resumes, extracted career information, assessment answers, interview-practice answers, and jobs you save or track. We do not ask for payment-card or banking information.</p></section>
    <section><h2>Resume and AI processing</h2><p>Resume text is sent to the configured Groq service to create a structured career profile and evidence-based job matches. When the same user replaces a resume, their prior structured profile may be used only to normalize spelling and identify changed fields; facts absent from the current resume must not be copied. Automated extraction can be inaccurate, so important fields should be reviewed. CarrerFit does not use resume data to make hiring decisions, and one user&apos;s private resume is never used to personalize another user&apos;s analysis.</p></section>
    <section><h2>First-party usage analytics</h2><p>CarrerFit records visited page paths, page-view counts, device category, and active time to operate and improve the service. Signed-in activity can be associated with the account for administrator support and product analytics. We do not record keystrokes, form contents, full query strings, or use a third-party advertising tracker.</p></section>
    <section><h2>Storage and protection</h2><p>For signed-in users, original resume files, extracted text, and detailed resume JSON are encrypted at rest with AES-256-GCM. Passwords are one-way hashed, session tokens are stored as hashes, and browser sessions use secure server-only cookies. A newer upload replaces the current stored resume for that account.</p></section>
    <section><h2>Interview camera</h2><p>Camera coaching is optional. Frames remain in the browser and are not uploaded or recorded by CarrerFit. Only local numeric coaching signals can be used during practice.</p></section>
    <section><h2>Jobs and external sites</h2><p>CarrerFit stores normalized facts from public employer job pages. When you choose Apply, you are sent to the employer-hosted page. CarrerFit does not submit an application or send your resume to an employer automatically.</p></section>
    <section><h2>Retention and requests</h2><p>Account data remains available while the account is active or until it is replaced or deleted following a verified request. To request access, correction, or deletion, email <a href="mailto:mail@carrerfit.com">mail@carrerfit.com</a> from the account address.</p></section>
    <section><h2>Safety</h2><p>CarrerFit will never ask you to install software, provide banking credentials, or disclose a verification code. Only enter an account password when the address bar shows <strong>https://carrerfit.com</strong>.</p></section>
    <footer><Link href="/">Return home</Link><Link href="/register">Create an account</Link></footer>
  </article></main>;
}
