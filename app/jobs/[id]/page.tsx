"use client";

import { ArrowLeft, Bookmark, Building2, Check, CircleDollarSign, Clock3, ExternalLink, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppNav from "../../../components/AppNav";
import { api } from "../../../lib/api";
import type { Job } from "../../../lib/types";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>(); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  useEffect(() => { api<Job>(`/api/jobs/${id}`).then(setJob).catch(err => setError(err.message)); }, [id]);
  async function save() { if (!job) return; await api("/api/applications", { method: "POST", body: JSON.stringify({ jobId: job.id }) }); setSaved(true); }
  return <main className="appShell"><AppNav light />{error && <div className="emptyState">{error}</div>}{!job && !error && <div className="loadingPanel">Loading role…</div>}{job && <>
    <section className="jobDetailHero"><Link href="/jobs"><ArrowLeft size={17}/> All jobs</Link><div className="detailTitle"><span className="companyLogo large">{job.logo}</span><div><span className="fitPill"><Sparkles size={14}/>{job.fitScore}% match</span><h1>{job.title}</h1><p><Building2 size={17}/>{job.company}</p></div></div><div className="detailMeta"><span><MapPin/>{job.location}</span><span><Clock3/>Posted {job.postedDaysAgo} days ago</span><span><CircleDollarSign/>{job.salaryMin > 0 ? `₹${job.salaryMin}–${job.salaryMax} LPA` : "Salary on employer site"}</span></div></section>
    <section className="jobDetailGrid"><article className="jobCopy"><h2>About the role</h2><p>{job.description}</p><h2>What you’ll bring</h2><ul>{job.requirements.map(skill => <li key={skill}><Check size={17}/>{skill}</li>)}</ul><h2>Why this fits you</h2><p>Your CarrerFit.com signals show strong overlap with this role’s core skills and work style. Upload your resume for a personal evidence-based score.</p><div className="originalSource"><Check/> Original listing verified on {job.source} · {new Date(job.verifiedAt).toLocaleDateString("en-IN")}</div></article><aside className="applyCard"><span>CarrerFit.com score</span><strong>{job.fitScore}%</strong><progress value={job.fitScore} max="100"/><p>Upload your resume to replace this baseline score with your personal match.</p><a className="externalApply" href={job.applyUrl} target="_blank" rel="noopener noreferrer">Apply on {job.source} <ExternalLink/></a><button onClick={save}>{saved ? <><Check/> Saved to dashboard</> : <><Bookmark/> Save opportunity</>}</button><small>Applications happen on the employer-hosted page. CarrerFit.com never submits your data.</small></aside></section>
  </>}</main>;
}
