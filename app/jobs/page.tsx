"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import AppNav from "../../components/AppNav";
import JobCard from "../../components/JobCard";
import { api } from "../../lib/api";
import type { Job } from "../../lib/types";

const categories = ["All", "Product", "Data", "Design", "Engineering", "Salesforce", "Marketing", "Customer Success"];
const modes = ["All", "Remote", "Hybrid", "On-site"];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [q, setQ] = useState(""); const [category, setCategory] = useState("All"); const [mode, setMode] = useState("All");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      api<{ jobs: Job[] }>(`/api/jobs?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&mode=${encodeURIComponent(mode)}`)
        .then((data) => setJobs(data.jobs)).catch((err) => setError(err.message)).finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [q, category, mode]);
  return <main className="appShell">
    <AppNav light />
    <section className="pageHero jobsHero"><span className="kicker">Live opportunity matching</span><h1>Roles that fit where you’re going.</h1><p>Search curated roles and see how your strengths line up before you apply.</p></section>
    <section className="jobsWorkspace">
      <aside className="filters"><h2><SlidersHorizontal size={19} /> Filters</h2><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map(x => <option key={x}>{x}</option>)}</select></label><label>Work style<select value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map(x => <option key={x}>{x}</option>)}</select></label><button onClick={() => { setQ(""); setCategory("All"); setMode("All"); }}>Clear filters</button></aside>
      <div className="results"><div className="resultsToolbar"><label><Search size={20}/><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, company, or skill" /></label><span>{loading ? "Finding roles…" : `${jobs.length} roles found`}</span></div>
        {error && <div className="emptyState">{error}. Make sure the Express API is running.</div>}
        {!loading && !error && jobs.length === 0 && <div className="emptyState"><h3>No roles found</h3><p>Try a broader keyword or clear your filters.</p></div>}
        <div className="listingGrid">{jobs.map(job => <JobCard job={job} key={job.id} />)}</div>
      </div>
    </section>
  </main>;
}
