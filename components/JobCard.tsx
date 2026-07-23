"use client";

import { ArrowUpRight, Bookmark, Building2, Check, CheckCircle2, Clock3, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Job } from "../lib/types";
import { api } from "../lib/api";

export default function JobCard({ job, initiallySaved = false, index = 0 }: { job: Job; initiallySaved?: boolean; index?: number }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (saved || busy) return;
    setBusy(true);
    try {
      await api("/api/applications", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
      setSaved(true);
    } finally { setBusy(false); }
  }
  const fitTone = job.fitScore >= 85 ? "excellent" : job.fitScore >= 70 ? "strong" : "explore";

  return <article className={`premiumJobCard fit-${fitTone}`} style={{"--card-delay": `${Math.min(index, 8) * 70}ms`} as React.CSSProperties}>
    <div className="jobCardAccent"/>
    <div className="premiumJobTop">
      <span className="premiumLogo">{job.logo}</span>
      <div className="companyIdentity"><span>{job.company}</span><small><CheckCircle2/> Verified via {job.sourceName || job.source}</small></div>
      <button className={saved ? "saved" : ""} disabled={busy} onClick={save} aria-label={saved ? "Job saved" : "Save job"}>{saved ? <Check/> : <Bookmark/>}</button>
    </div>
    <div className="jobMatchLine"><span><Sparkles/> {job.fitScore >= 80 ? "Top opportunity" : "Recommended"}</span><strong>{job.fitScore}% <small>match</small></strong></div>
    <h3><Link href={`/jobs/${job.id}`}>{job.title}</Link></h3>
    <div className="premiumMeta"><span><MapPin/>{job.location}</span><span><Building2/>{job.workMode}</span><span><Clock3/>{job.postedDaysAgo === 0 ? "Today" : `${job.postedDaysAgo}d ago`}</span></div>
    <div className="premiumSkills">{job.skills.slice(0, 4).map(skill => <span key={skill}>{skill}</span>)}{job.skills.length > 4 && <span>+{job.skills.length - 4}</span>}</div>
    <div className="salaryLine"><span>Compensation</span><strong>{job.salaryMin > 0 ? `₹${job.salaryMin}–${job.salaryMax} LPA` : "Employer listed"}</strong></div>
    <div className="premiumJobActions"><Link href={`/jobs/${job.id}`}>Explore fit <ArrowUpRight/></Link><a href={job.applyUrl} target="_blank" rel="noopener noreferrer">Apply now <ArrowUpRight/></a></div>
  </article>;
}
