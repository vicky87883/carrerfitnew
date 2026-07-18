"use client";

import { Bookmark, Building2, Check, Clock3, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Job } from "../lib/types";
import { api } from "../lib/api";

export default function JobCard({ job, initiallySaved = false }: { job: Job; initiallySaved?: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (saved || busy) return;
    setBusy(true);
    try { await api("/api/applications", { method: "POST", body: JSON.stringify({ jobId: job.id }) }); setSaved(true); }
    finally { setBusy(false); }
  }
  return (
    <article className="listingCard">
      <div className="listingTop"><span className="companyLogo">{job.logo}</span><button className={saved ? "saved" : ""} onClick={save} aria-label="Save job">{saved ? <Check /> : <Bookmark />}</button></div>
      <div className="fitPill">{job.fitScore}% match</div>
      <h3><Link href={`/jobs/${job.id}`}>{job.title}</Link></h3>
      <p className="companyName"><Building2 size={16} /> {job.company}</p>
      <div className="jobMeta"><span><MapPin size={15} />{job.location}</span><span><Clock3 size={15} />{job.postedDaysAgo}d ago</span></div>
      <div className="tagRow">{job.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}</div>
      <div className="listingBottom"><div><strong>{job.salaryMin > 0 ? `₹${job.salaryMin}–${job.salaryMax} LPA` : "Salary not listed"}</strong><small>{job.salaryMin > 0 ? "Market estimate" : "Check employer listing"}</small></div><span><Link href={`/jobs/${job.id}`}>Fit details</Link><a href={job.applyUrl} target="_blank" rel="noopener noreferrer">Apply <ExternalLink/></a></span></div>
      <small className="jobSource"><Check size={11}/> Verified on {job.source}</small>
    </article>
  );
}
