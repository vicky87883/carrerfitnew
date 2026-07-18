"use client";

import { ArrowRight, Bookmark, BriefcaseBusiness, CalendarCheck, ChevronDown, CircleUserRound, RefreshCw, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppNav from "../../components/AppNav";
import { api } from "../../lib/api";
import type { Application, DashboardData } from "../../lib/types";

const statuses: Application["status"][] = ["Saved", "Applied", "Interview", "Offer"];
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState("");
  const load = useCallback(() => { setError(""); api<DashboardData>("/api/dashboard").then(setData).catch(err => setError(err.message)); }, []);
  useEffect(load, [load]);
  async function update(id: string, status: Application["status"]) { await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); load(); }
  async function remove(id: string) { await api(`/api/applications/${id}`, { method: "DELETE" }); load(); }
  return <main className="appShell dashboardShell"><AppNav light />
    <section className="dashboardHeader"><div><span className="kicker">My career workspace</span><h1>{data ? `Welcome back, ${data.profile.name}.` : "Your CarrerFit.com dashboard"}</h1><p>Keep your matches, applications, and next steps moving in one place.</p></div><Link href="/jobs">Find more roles <ArrowRight size={17}/></Link></section>
    {error && <div className="emptyState">{error}</div>}
    {!data && !error && <div className="loadingPanel"><RefreshCw className="spin"/> Loading your workspace…</div>}
    {data && <section className="dashboardGrid">
      <div className="metricGrid"><article><Bookmark/><strong>{data.stats.saved}</strong><span>Saved roles</span></article><article><BriefcaseBusiness/><strong>{data.stats.applied}</strong><span>Applications</span></article><article><CalendarCheck/><strong>{data.stats.interviews}</strong><span>Interviews</span></article><article className="readiness"><Target/><strong>{data.stats.readiness}%</strong><span>Application ready</span></article></div>
      <article className="dashboardPanel careerPanel"><div className="panelHeading"><div><span className="kicker">Career direction</span><h2>Your top matches</h2></div><Link href="/assessment">Retake assessment</Link></div>
        {data.matches.length ? <div className="careerRows">{data.matches.map((match, i) => <div key={match.role}><span className="rank">0{i+1}</span><div><strong>{match.role}</strong><small>{match.summary}</small></div><b>{match.score}%</b></div>)}</div> : <div className="panelEmpty"><Sparkles/><h3>Discover your best-fit careers</h3><p>Complete the 3-minute assessment to unlock personalized matches.</p><Link href="/assessment">Start assessment</Link></div>}
      </article>
      <article className="dashboardPanel resumeProfilePanel"><div className="panelHeading"><div><span className="kicker">Private resume profile</span><h2>{data.resumeProfile ? data.resumeProfile.headline : "Add your resume intelligence"}</h2></div><Link href="/resume">{data.resumeProfile ? "Analyze again" : "Upload resume"}</Link></div>
        {data.resumeProfile ? <><p>{data.resumeProfile.summary}</p><dl><div><dt>Experience</dt><dd>{data.resumeProfile.yearsExperience} years · {data.resumeProfile.seniority}</dd></div><div><dt>Target roles</dt><dd>{data.resumeProfile.targetRoles.join(", ") || "Not detected"}</dd></div></dl><div className="skillTags">{data.resumeProfile.skills.slice(0, 12).map(skill => <span key={skill}>{skill}</span>)}</div></> : <div className="panelEmpty"><ShieldIcon/><h3>Your original file is never retained</h3><p>Only the structured profile and matches are stored in your account after analysis.</p><Link href="/resume">Analyze securely</Link></div>}
      </article>
      <article className="dashboardPanel pipelinePanel"><div className="panelHeading"><div><span className="kicker">Job pipeline</span><h2>Saved & applied roles</h2></div></div>
        {data.applications.length ? <div className="applicationRows">{data.applications.map(item => <div key={item.id}><span className="companyLogo">{item.job.logo}</span><div><Link href={`/jobs/${item.job.id}`}>{item.job.title}</Link><small>{item.job.company} · {item.job.workMode}</small></div><label><select value={item.status} onChange={e => update(item.id, e.target.value as Application["status"])}>{statuses.map(s => <option key={s}>{s}</option>)}</select><ChevronDown/></label><button onClick={() => remove(item.id)}>Remove</button></div>)}</div> : <div className="panelEmpty"><BriefcaseBusiness/><h3>Your pipeline is ready</h3><p>Save a job and it will appear here for easy tracking.</p><Link href="/jobs">Browse roles</Link></div>}
      </article>
      <aside className="dashboardPanel profilePanel"><CircleUserRound size={34}/><h2>{data.profile.name}</h2><p>{data.profile.email}</p><div><span>Profile strength <b>{data.profile.completion}%</b></span><progress max="100" value={data.profile.completion}/></div><h3>This week</h3><ul><li><CheckDot/>Save 3 best-fit roles</li><li><CheckDot/>Add one portfolio project</li><li><CheckDot/>Practice your career story</li></ul></aside>
    </section>}
  </main>;
}

function CheckDot() { return <span className="checkDot"><Sparkles size={12}/></span>; }
function ShieldIcon() { return <CircleUserRound/>; }
