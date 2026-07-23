"use client";

import {
  ArrowRight, Bookmark, BriefcaseBusiness, CalendarCheck, CheckCircle2, ChevronDown,
  CircleUserRound, FileSearch, Flame, RefreshCw, ShieldCheck, Sparkles, Target,
  TrendingUp, WandSparkles
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppNav from "../../components/AppNav";
import { api } from "../../lib/api";
import type { Application, DashboardData } from "../../lib/types";

const statuses: Application["status"][] = ["Saved", "Applied", "Interview", "Offer"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<DashboardData>("/api/dashboard").then(setData).catch(err => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function update(id: string, status: Application["status"]) {
    await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }
  async function remove(id: string) {
    await api(`/api/applications/${id}`, { method: "DELETE" });
    load();
  }

  const pipeline = useMemo(() => statuses.map(status => ({
    status,
    count: data?.applications.filter(item => item.status === status).length || 0
  })), [data]);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const atsScore = data?.resumeAts?.score ?? data?.stats.readiness ?? 0;
  const momentum = data ? Math.min(100, 24 + data.stats.saved * 8 + data.stats.applied * 14 + data.stats.interviews * 20) : 0;

  return <main className="appShell dashboardShell dashboardV2">
    <AppNav light />
    <section className="dashHero">
      <div className="dashAura dashAuraOne" /><div className="dashAura dashAuraTwo" />
      <div className="dashHeroCopy">
        <span className="dashLive"><i /> AI career command centre</span>
        <p className="dashGreeting">{greeting}{data ? `, ${data.profile.name.split(" ")[0]}` : ""}</p>
        <h1>Make your next move<br/><em>impossible to ignore.</em></h1>
        <p>Your resume intelligence, strongest opportunities, and application momentum—organized into one focused workspace.</p>
        <div className="dashHeroActions">
          <Link className="dashPrimary" href="/jobs">Explore matched roles <ArrowRight /></Link>
          <Link className="dashSecondary" href="/interview"><WandSparkles /> Practice an interview</Link>
        </div>
      </div>
      <div className="dashOrbit" aria-hidden="true">
        <div className="orbitRing orbitRingOuter" /><div className="orbitRing orbitRingInner" />
        <div className="orbitCore"><Sparkles/><strong>{atsScore}%</strong><span>career signal</span></div>
        <span className="orbitChip chipOne"><Target/> Match-ready</span>
        <span className="orbitChip chipTwo"><ShieldCheck/> Private by design</span>
        <span className="orbitChip chipThree"><TrendingUp/> Momentum {momentum}%</span>
      </div>
    </section>

    {error && <div className="emptyState">{error}</div>}
    {!data && !error && <div className="dashLoading"><span className="loaderConstellation"><i/><i/><i/></span><strong>Building your career intelligence</strong><small>Syncing profile, resume and opportunities…</small></div>}

    {data && <section className="dashWorkspace">
      <div className="dashMetricGrid">
        <Metric icon={<Bookmark/>} label="Saved roles" value={data.stats.saved} detail="Your opportunity shortlist" tone="blue"/>
        <Metric icon={<BriefcaseBusiness/>} label="Applications" value={data.stats.applied} detail="Active in your pipeline" tone="violet"/>
        <Metric icon={<CalendarCheck/>} label="Interviews" value={data.stats.interviews} detail="Conversations unlocked" tone="orange"/>
        <Metric icon={<Target/>} label={data.resumeAts ? "ATS score" : "Readiness"} value={`${atsScore}%`} detail={atsScore >= 75 ? "Strong market signal" : "Ready to improve"} tone="lime"/>
      </div>

      <article className="dashCard dashMomentum">
        <div className="dashCardHead">
          <div><span>Weekly momentum</span><h2>Your career pulse</h2></div>
          <span className="momentumBadge"><Flame/> {momentum >= 70 ? "On fire" : "Building"}</span>
        </div>
        <div className="momentumBody">
          <div className="momentumRing" style={{"--progress": `${momentum * 3.6}deg`} as React.CSSProperties}>
            <div><strong>{momentum}</strong><span>/100</span><small>Momentum</small></div>
          </div>
          <div className="momentumChecklist">
            <MomentumLine done={Boolean(data.resumeDocument)} title="Resume intelligence" detail={data.resumeDocument ? `${data.resumeDocument.skills.length} skills mapped` : "Upload your latest resume"} />
            <MomentumLine done={data.stats.saved >= 3} title="Opportunity shortlist" detail={`${data.stats.saved}/3 roles saved`} />
            <MomentumLine done={data.stats.applied > 0} title="Application action" detail={data.stats.applied ? `${data.stats.applied} applications moving` : "Apply to your strongest match"} />
          </div>
        </div>
      </article>

      <article className="dashCard dashMatches">
        <div className="dashCardHead"><div><span>AI recommendations</span><h2>Best-fit career paths</h2></div><Link href="/assessment">Refresh profile <ArrowRight/></Link></div>
        {data.matches.length ? <div className="matchStack">{data.matches.slice(0, 3).map((match, i) =>
          <div className="matchRow" key={match.role}>
            <span className="matchIndex">0{i + 1}</span>
            <div><strong>{match.role}</strong><small>{match.summary}</small><span className="matchBar"><i style={{width: `${match.score}%`}}/></span></div>
            <b>{match.score}<small>%</small></b>
          </div>)}</div> :
          <div className="dashEmpty"><span><Sparkles/></span><div><h3>Discover your best-fit direction</h3><p>Complete the three-minute assessment and unlock your personalized career map.</p></div><Link href="/assessment">Start now <ArrowRight/></Link></div>}
      </article>

      <article className="dashCard dashResume">
        <div className="dashCardHead"><div><span>Private resume intelligence</span><h2>{data.resumeProfile?.headline || "Turn your resume into a strategy"}</h2></div><Link href="/resume">{data.resumeProfile ? "Analyze again" : "Upload resume"} <ArrowRight/></Link></div>
        {data.resumeProfile ? <>
          <p className="resumeSummary">{data.resumeProfile.summary}</p>
          <div className="resumeSignalGrid">
            <div><strong>{data.resumeAts?.score ?? "—"}{data.resumeAts ? "%" : ""}</strong><span>ATS compatibility</span></div>
            <div><strong>{data.resumeDocument?.skills.length ?? data.resumeProfile.skills.length}</strong><span>Skills evidenced</span></div>
            <div><strong>{data.resumeAts?.metrics.quantifiedAchievements ?? 0}</strong><span>Measured outcomes</span></div>
            <div><strong>{data.resumeDocument ? Math.round(data.resumeDocument.extractionConfidence * 100) : "—"}{data.resumeDocument ? "%" : ""}</strong><span>Extraction confidence</span></div>
          </div>
          <div className="skillCloud">{(data.resumeDocument?.skills.map(skill => skill.name) || data.resumeProfile.skills).slice(0, 12).map((skill, index) => <span style={{"--delay": `${index * 45}ms`} as React.CSSProperties} key={skill}>{skill}</span>)}</div>
          {data.resumeAts?.priorityFixes[0] && <div className="nextMove"><span><FileSearch/></span><div><b>Your highest-impact improvement</b><small>{data.resumeAts.priorityFixes[0]}</small></div><Link href="/resume"><ArrowRight/></Link></div>}
        </> : <div className="dashEmpty"><span><ShieldCheck/></span><div><h3>Your private career engine starts here</h3><p>Upload a PDF or Word resume to unlock ATS insights, skills intelligence, and evidence-ranked jobs.</p></div><Link href="/resume">Analyze securely <ArrowRight/></Link></div>}
      </article>

      {data.resumeJobs?.length ? <article className="dashCard dashOpportunities">
        <div className="dashCardHead"><div><span>Evidence-ranked opportunities</span><h2>Jobs selected for you</h2></div><Link href="/jobs">View marketplace <ArrowRight/></Link></div>
        <div className="opportunityRail">{data.resumeJobs.slice(0, 4).map(job => <Link href={`/jobs/${job.id}`} key={job.id}>
          <span className="opportunityLogo">{job.logo}</span><div><b>{job.title}</b><small>{job.company} · {job.workMode}</small><p>{job.matchReason}</p></div>
          <strong>{job.fitScore}%<small>{job.matchConfidence}</small></strong>
        </Link>)}</div>
      </article> : null}

      <article className="dashCard dashPipeline">
        <div className="dashCardHead"><div><span>Application tracker</span><h2>Your opportunity pipeline</h2></div></div>
        <div className="pipelineSummary">{pipeline.map(item => <div key={item.status}><span>{item.status}</span><strong>{item.count}</strong><i className={`pipe-${item.status.toLowerCase()}`}/></div>)}</div>
        {data.applications.length ? <div className="applicationRows modernRows">{data.applications.map(item => <div key={item.id}>
          <span className="companyLogo">{item.job.logo}</span><div><Link href={`/jobs/${item.job.id}`}>{item.job.title}</Link><small>{item.job.company} · {item.job.workMode}</small></div>
          <label><select value={item.status} onChange={e => update(item.id, e.target.value as Application["status"])}>{statuses.map(status => <option key={status}>{status}</option>)}</select><ChevronDown/></label>
          <button onClick={() => remove(item.id)}>Remove</button>
        </div>)}</div> : <div className="dashEmpty"><span><BriefcaseBusiness/></span><div><h3>Your pipeline is ready</h3><p>Save a job to start tracking every move from shortlist to offer.</p></div><Link href="/jobs">Browse roles <ArrowRight/></Link></div>}
      </article>

      <aside className="dashCard dashProfile">
        <div className="profileIdentity"><span>{data.profile.name.split(" ").map(word => word[0]).slice(0,2).join("")}</span><div><small>Career profile</small><h2>{data.profile.name}</h2><p>{data.profile.email}</p></div></div>
        <div className="profileStrength"><span>Profile strength <b>{data.profile.completion}%</b></span><i><b style={{width:`${data.profile.completion}%`}}/></i></div>
        <div className="profileFocus">
          <span>This week’s focus</span>
          <ul>
            <li className={data.resumeDocument ? "done" : ""}><CheckCircle2/><span><b>Resume profile</b><small>{data.resumeDocument ? "Intelligence active" : "Upload your latest version"}</small></span></li>
            <li className={data.stats.saved >= 3 ? "done" : ""}><CheckCircle2/><span><b>Build your shortlist</b><small>{data.stats.saved}/3 strong roles saved</small></span></li>
            <li className={data.stats.interviews > 0 ? "done" : ""}><CheckCircle2/><span><b>Practice your story</b><small>Run an AI mock interview</small></span></li>
          </ul>
        </div>
        <Link className="profileAction" href="/interview"><CircleUserRound/> Open interview studio <ArrowRight/></Link>
      </aside>
    </section>}
  </main>;
}

function Metric({icon, label, value, detail, tone}: {icon: React.ReactNode; label: string; value: string | number; detail: string; tone: string}) {
  return <article className={`dashMetric metric-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div><TrendingUp className="metricTrend"/></article>;
}
function MomentumLine({done, title, detail}: {done: boolean; title: string; detail: string}) {
  return <div className={done ? "done" : ""}><span>{done ? <CheckCircle2/> : <i/>}</span><p><b>{title}</b><small>{detail}</small></p></div>;
}
