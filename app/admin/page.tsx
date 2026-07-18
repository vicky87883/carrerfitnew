"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";

type AdminStatus = { admin: boolean; unlocked: boolean; passwordConfigured: boolean };
export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null); const [password, setPassword] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [stats, setStats] = useState<Record<string, number> | null>(null);
  async function call(path: string, init?: RequestInit) { const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.message || "Request failed"); return body; }
  async function load() { try { const result = await call("/api/admin/status"); setStatus(result); if (result.unlocked) { const data = await call("/api/admin/overview"); setStats(data.stats); } } catch (cause) { setError(cause instanceof Error ? cause.message : "Administrator access is required."); } }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { await call("/api/admin/unlock", { method: "POST", body: JSON.stringify({ password }) }); setNotice("Admin access is active for this session."); setPassword(""); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unlock the control centre."); } }
  return <main className="pageShell"><AppNav/><section className="contentWrap"><p className="eyebrow">Restricted control centre</p><h1>Administrator control</h1>{error && <p role="alert">{error}</p>}{notice && <p>{notice}</p>}{status && !status.passwordConfigured && <p>Set a secure `ADMIN_PASSWORD` in Hostinger first, then redeploy.</p>}{status?.passwordConfigured && !status.unlocked && <div><p>Enter the server-side administrator password to unlock this session.</p><form onSubmit={submit}><label>Administrator password <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label><button>Unlock admin panel</button></form></div>}{status?.unlocked && <div><p>Administrator access is active for this signed-in session.</p><div className="gridCards">{Object.entries(stats || {}).map(([key, value]) => <article key={key}><strong>{value}</strong><span>{key.replace(/([A-Z])/g, " $1")}</span></article>)}</div><p><Link href="/job-sources">Manage job sources</Link> · <Link href="/blog-admin">Manage blog posts</Link></p></div>}</section></main>;
}
