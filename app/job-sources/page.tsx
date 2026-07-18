"use client";

import { Activity, ArrowRight, BriefcaseBusiness, Check, CircleAlert, Clock3, Database, ExternalLink, Globe2, LoaderCircle, LockKeyhole, Play, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import AppNav from "../../components/AppNav";
import type { JobSourceOverview } from "../../lib/types";

export default function JobSourcesPage() {
  const [token, setToken] = useState(""); const [draftToken, setDraftToken] = useState("");
  const [overview, setOverview] = useState<JobSourceOverview | null>(null);
  const [url, setUrl] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");

  useEffect(() => { const saved = sessionStorage.getItem("carrerfit_scraper_token") || ""; if (saved) { setToken(saved); setDraftToken(saved); } }, []);
  useEffect(() => { if (token) void load(); }, [token]);

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "x-admin-token": token, ...options?.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Request failed");
    return body as T;
  }
  async function load() { setError(""); try { setOverview(await request<JobSourceOverview>("/api/job-sources")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load job sources."); } }
  function unlock(event: FormEvent) { event.preventDefault(); const value = draftToken.trim(); if (!value) return; sessionStorage.setItem("carrerfit_scraper_token", value); setToken(value); }
  async function addSource(event: FormEvent) {
    event.preventDefault(); if (!url.trim()) return;
    setBusy("add"); setError(""); setNotice("");
    try { const result = await request<{ imported: number }>("/api/job-sources", { method: "POST", body: JSON.stringify({ url, name }) }); setNotice(`${result.imported} active jobs imported.`); setUrl(""); setName(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Source import failed."); }
    finally { setBusy(""); }
  }
  async function scrape(id: string) { setBusy(id); setError(""); try { const result = await request<{ imported: number }>(`/api/job-sources/${id}/scrape`, { method: "POST", body: "{}" }); setNotice(`${result.imported} jobs refreshed.`); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Refresh failed."); } finally { setBusy(""); } }
  async function scrapeAll() { setBusy("all"); setError(""); try { const result = await request<{ refreshed: number; failed: number; overview: JobSourceOverview }>("/api/job-sources/scrape-all", { method: "POST", body: "{}" }); setOverview(result.overview); setNotice(`${result.refreshed} sources refreshed${result.failed ? `, ${result.failed} failed` : ""}.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Refresh failed."); } finally { setBusy(""); } }
  async function remove(id: string) { setBusy(id); setError(""); try { await request(`/api/job-sources/${id}`, { method: "DELETE" }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed."); } finally { setBusy(""); } }
  async function toggle(id: string, enabled: boolean) { setBusy(id); try { await request(`/api/job-sources/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed."); } finally { setBusy(""); } }

  if (!token) return <main className="sourceShell"><AppNav/><section className="sourceUnlock"><span><LockKeyhole/></span><small>Protected operations workspace</small><h1>Unlock job ingestion.</h1><p>Enter the server-side scraper admin token. It stays in this browser session and is never added to the URL.</p><form onSubmit={unlock}><input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="SCRAPER_ADMIN_TOKEN" autoComplete="off"/><button>Open workspace <ArrowRight/></button></form><div><ShieldCheck/> Source management is isolated from the public job board.</div></section></main>;

  return <main className="sourceApp"><AppNav light/><section className="sourceHero"><div><span><Database/> Job ingestion control</span><h1>Build your own live opportunity database.</h1><p>Connect public employer job boards, normalize their listings, and keep CarrerFit search fresh without copying candidate data.</p></div><button onClick={scrapeAll} disabled={Boolean(busy)}>{busy === "all" ? <LoaderCircle className="spin"/> : <RefreshCw/>} Refresh all sources</button></section>
    <section className="sourceWorkspace"><div className="sourceStats"><article><span><Globe2/></span><div><b>{overview?.stats.sources || 0}</b><small>Connected sources</small></div></article><article><span><BriefcaseBusiness/></span><div><b>{overview?.stats.activeJobs || 0}</b><small>Active imported jobs</small></div></article><article><span><Activity/></span><div><b>{overview?.stats.last24Hours || 0}</b><small>New in 24 hours</small></div></article><article className={overview?.stats.failedSources ? "hasFailure" : ""}><span><CircleAlert/></span><div><b>{overview?.stats.failedSources || 0}</b><small>Sources needing attention</small></div></article></div>
      <div className="sourceColumns"><form className="addSourceCard" onSubmit={addSource}><span><Plus/> Add job source</span><h2>Connect a public careers board.</h2><p>Works with Lever, Greenhouse, Ashby, or a single job page publishing JobPosting structured data.</p><label>Source URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://jobs.lever.co/company" required/></label><label>Company name <small>Optional</small><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Detected from the URL if empty"/></label><button disabled={busy === "add"}>{busy === "add" ? <><LoaderCircle className="spin"/> Connecting and importing</> : <>Connect source <ArrowRight/></>}</button><small className="sourceSafety"><ShieldCheck/> HTTPS only · private networks blocked · maximum 300 jobs per source</small></form>
        <div className="sourceList"><div className="sourceListHeading"><div><span>Connected sources</span><h2>Refresh health</h2></div><small>{overview?.sources.length || 0} total</small></div>{error && <div className="sourceMessage error"><CircleAlert/>{error}</div>}{notice && <div className="sourceMessage success"><Check/>{notice}</div>}{!overview?.sources.length && <div className="emptySources"><Globe2/><h3>No sources connected yet.</h3><p>Add a public job-board URL to create your first import.</p></div>}{overview?.sources.map((source) => <article className="sourceRow" key={source.id}><span className={`sourceStatus ${source.lastStatus.toLowerCase()}`}/><div className="sourceIdentity"><div><strong>{source.name}</strong><i>{source.type}</i>{!source.enabled && <i className="paused">Paused</i>}</div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}<ExternalLink/></a>{source.lastError && <p>{source.lastError}</p>}</div><div className="sourceNumbers"><strong>{source.activeJobCount}</strong><small>active jobs</small><span><Clock3/> {source.lastScrapedAt ? new Date(source.lastScrapedAt).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : "Not refreshed"}</span></div><div className="sourceActions"><button onClick={() => scrape(source.id)} disabled={Boolean(busy)} title="Refresh source">{busy === source.id ? <LoaderCircle className="spin"/> : <Play/>}</button><button onClick={() => toggle(source.id, !source.enabled)} disabled={Boolean(busy)}>{source.enabled ? "Pause" : "Enable"}</button><button className="deleteSource" onClick={() => remove(source.id)} disabled={Boolean(busy)} title="Delete source"><Trash2/></button></div></article>)}</div></div>
      <section className="recentImports"><div className="sourceListHeading"><div><span>Database preview</span><h2>Recently imported roles</h2></div><a href="/jobs">Open job board <ArrowRight/></a></div><div>{overview?.recentJobs.map((job) => <article key={job.id}><span>{job.logo}</span><div><strong>{job.title}</strong><p>{job.company} · {job.location}</p></div><i>{job.source}</i><a href={job.applyUrl} target="_blank" rel="noopener noreferrer">View <ExternalLink/></a></article>)}</div>{!overview?.recentJobs.length && <p className="noRecentJobs">Imported jobs will appear here and in the public job board.</p>}</section>
    </section></main>;
}
