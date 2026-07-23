"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleCheck,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { DragEvent, useEffect, useRef, useState } from "react";
import AppNav from "../../components/AppNav";
import { api } from "../../lib/api";
import type { ResumeMatchResult } from "../../lib/types";

type Stage = "idle" | "reading" | "analyzing" | "validating" | "matching" | "done";
const loadingCopy = {
  reading: [
    "Reading your resume",
    "Extracting experience, education, and skills",
  ],
  analyzing: [
    "Building your career profile",
    "The AI is mapping roles, achievements, skills, and education",
  ],
  validating: [
    "Validating extracted evidence",
    "Checking every structured field before encrypted JSON storage",
  ],
  matching: [
    "Ranking live opportunities",
    "Comparing your evidence with real role requirements",
  ],
} as const;

export default function ResumePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ResumeMatchResult | null>(null);
  const [error, setError] = useState("");
  const busy = stage !== "idle" && stage !== "done";

  useEffect(() => {
    if (!busy) return;
    const states: Stage[] = ["reading", "analyzing", "validating", "matching"];
    const timer = window.setInterval(
      () =>
        setStage((current) => {
          const index = states.indexOf(current);
          return index >= 0 && index < states.length - 1
            ? states[index + 1]
            : current;
        }),
      1500,
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  function choose(selected?: File) {
    if (!selected) return;
    const valid =
      selected.name.toLowerCase().endsWith(".pdf") ||
      selected.name.toLowerCase().endsWith(".docx");
    if (!valid) return setError("Please choose a PDF or DOCX resume.");
    if (selected.size > 8 * 1024 * 1024)
      return setError("Resume must be smaller than 8 MB.");
    setFile(selected);
    setError("");
    setResult(null);
    setStage("idle");
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }
  async function analyze() {
    if (!file) return;
    setError("");
    setStage("reading");
    const body = new FormData();
    body.append("resume", file);
    const visibleStartedAt = Date.now();
    try {
      const data = await api<ResumeMatchResult>("/api/resume/analyze", {
        method: "POST",
        body,
      });
      const remaining = Math.max(0, 6200 - (Date.now() - visibleStartedAt));
      if (remaining) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      setResult(data);
      setStage("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not analyze this resume.",
      );
      setStage("idle");
    }
  }
  function reset() {
    setFile(null);
    setResult(null);
    setStage("idle");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  if (busy) {
    const [title, copy] = loadingCopy[stage as keyof typeof loadingCopy];
    return (
      <main className="resumeShell loadingShell">
        <AppNav light={false} />
        <section className="analysisLoader">
          <div className="aiLoader">
            <i />
            <i />
            <i />
            <span>
              <Sparkles />
            </span>
          </div>
          <span className="loaderKicker">CarrerFit.com intelligence</span>
          <h1>{title}</h1>
          <p>{copy}</p>
          <div className="analysisSteps">
            {(["reading", "analyzing", "validating", "matching"] as Stage[]).map(
              (item, index) => {
                const current = ["reading", "analyzing", "validating", "matching"].indexOf(
                  stage,
                );
                return (
                  <div
                    className={
                      index < current
                        ? "complete"
                        : index === current
                          ? "active"
                          : ""
                    }
                    key={item}
                  >
                    {index < current ? (
                      <Check />
                    ) : index === current ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                    <strong>
                      {item === "reading"
                        ? "Parse document"
                        : item === "analyzing"
                          ? "Understand profile"
                          : item === "validating"
                            ? "Validate JSON"
                            : "Rank opportunities"}
                    </strong>
                  </div>
                );
              },
            )}
          </div>
          <small>Your document is encrypted at rest; extracted fields are validated before they reach your private profile.</small>
        </section>
      </main>
    );
  }

  if (result)
    return (
      <main className="appShell resumeResults">
        <AppNav light />
        <section className="resumeResultHero">
          <div>
            <span className="resultBadge">
              <Sparkles />{" "}
              {result.aiPowered ? "AI career profile" : "Skills-based profile"}
            </span>
            <h1>
              {result.profile.name !== "Candidate"
                ? `${result.profile.name}, your`
                : "Your"}{" "}
              strongest opportunities are ready.
            </h1>
            <p>{result.profile.summary}</p>
            <button
              className="resumeInterviewCta"
              onClick={() => {
                if (!result.storedForAccount)
                  sessionStorage.setItem(
                    "carrerfit_resume_profile",
                    JSON.stringify(result.profile),
                  );
                window.location.href = "/interview";
              }}
            >
              <Sparkles /> Practice a resume-based interview <ArrowRight />
            </button>
          </div>
          <button onClick={reset}>
            <RefreshCw /> Analyze another resume
          </button>
        </section>
        <section className="atsReport">
          <div className="atsScore">
            <span>ATS compatibility</span>
            <strong>{result.ats.score}<i>/100</i></strong>
            <b>{result.ats.label}</b>
            <small>{result.ats.disclaimer}</small>
          </div>
          <div className="atsBreakdown">
            <h2>Resume scan</h2>
            {result.ats.categories.map((category) => <div className="atsCategory" key={category.name}>
              <span>{category.name}<b>{category.score}%</b></span>
              <progress max="100" value={category.score}/>
            </div>)}
          </div>
          <div className="atsFixes">
            <h2>Priority improvements</h2>
            {result.ats.priorityFixes.length ? <ul>{result.ats.priorityFixes.slice(0, 4).map((fix) => <li key={fix}><CircleCheck/>{fix}</li>)}</ul> : <p>No high-priority parsing issues detected. Tailor keywords to each job description before applying.</p>}
          </div>
        </section>
        <section className="resumeResultGrid">
          <aside className="profileBrief">
            <span className="profileInitial">
              {result.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <h2>{result.profile.headline}</h2>
            <p>
              {result.profile.seniority} · {result.profile.yearsExperience}{" "}
              years detected
            </p>
            <div>
              <span>Profile skills</span>
              <div className="profileSkills">
                {result.profile.skills.slice(0, 12).map((skill) => (
                  <i key={skill}>{skill}</i>
                ))}
              </div>
            </div>
            <div>
              <span>Resume improvements</span>
              <ul>
                {result.profile.improvements.map((item) => (
                  <li key={item}>
                    <CircleCheck />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <small>
              <ShieldCheck />{" "}
              {result.storedForAccount
                ? "Original file, extracted text, and structured JSON saved in your encrypted private vault."
                : "Analysis generated from the uploaded document. Review before acting."}
            </small>
          </aside>
          <div className="rankedJobs">
            <div className="rankedHeading">
              <div>
                <span>Best-fit live roles</span>
                <h2>
                  {result.jobs.length
                    ? `${result.jobs.length} evidence-backed opportunities`
                    : "No strong live match yet"}
                </h2>
              </div>
              <small>Verified employer links</small>
            </div>
            {result.jobs.length === 0 ? (
              <div className="noStrongMatch">
                <span>
                  <BriefcaseBusiness />
                </span>
                <h3>We won’t recommend unrelated jobs.</h3>
                <p>
                  The current verified catalog does not contain a role with
                  enough direct evidence from this resume. Use the improvement
                  plan, add measurable role-specific work, or browse all roles
                  without a misleading fit score.
                </p>
                <Link href="/jobs">
                  Browse every live role <ArrowRight />
                </Link>
              </div>
            ) : (
              result.jobs.map((job, index) => (
                <article
                  key={job.id}
                  className={index === 0 ? "bestRankedJob" : ""}
                >
                  <div className="rankNumber">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="rankedMain">
                    <div className="rankedTitle">
                      <span className="companyLogo">{job.logo}</span>
                      <div>
                        <h3>{job.title}</h3>
                        <p>
                          {job.company} · {job.location} · {job.workMode}
                        </p>
                      </div>
                    </div>
                    <p className="matchReason">{job.matchReason}</p>
                    <div className="skillEvidence">
                      <div>
                        <span>Matched</span>
                        {job.matchedSkills.length ? (
                          job.matchedSkills.map((skill) => (
                            <i key={skill}>
                              <Check />
                              {skill}
                            </i>
                          ))
                        ) : (
                          <i>Transferable experience</i>
                        )}
                      </div>
                      <div>
                        <span>Build next</span>
                        {job.missingSkills.slice(0, 3).map((skill) => (
                          <i className="missing" key={skill}>
                            {skill}
                          </i>
                        ))}
                      </div>
                    </div>
                    <div className="sourceLine">
                      <ShieldCheck /> Listed on {job.source} · checked{" "}
                      {new Date(job.verifiedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                  <div className="rankedAction">
                    <strong>
                      {job.fitScore}
                      <span>%</span>
                    </strong>
                    <small>{job.matchConfidence} confidence</small>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View & apply <ExternalLink />
                    </a>
                    <span>Opens employer site</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    );

  return (
    <main className="resumeShell">
      <AppNav />
      <section className="resumeHero">
        <div className="resumeHeroCopy">
          <span className="modernEyebrow">
            <Sparkles /> AI resume-to-job matching
          </span>
          <h1>Your resume already knows your next move.</h1>
          <p>
            Upload it once. CarrerFit.com reads your experience, builds a career
            profile, and ranks verified opportunities by evidence—not buzzwords.
          </p>
          <div className="resumeTrust">
            <span>
              <ShieldCheck /> Private processing
            </span>
            <span>
              <LockKeyhole /> File not retained
            </span>
            <span>
              <BriefcaseBusiness /> Real job links
            </span>
          </div>
        </div>
        <div className="uploadPanel">
          <div
            className={dragging ? "dropZone dragging" : "dropZone"}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => choose(event.target.files?.[0])}
            />
            {file ? (
              <>
                <span className="fileIcon">
                  <FileText />
                </span>
                <strong>{file.name}</strong>
                <small>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Ready to analyze
                </small>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    reset();
                  }}
                  aria-label="Remove resume"
                >
                  <X />
                </button>
              </>
            ) : (
              <>
                <span className="uploadIcon">
                  <UploadCloud />
                </span>
                <strong>Drop your resume here</strong>
                <p>or click to choose a file</p>
                <small>PDF or DOCX · Maximum 8 MB</small>
              </>
            )}
          </div>
          {error && <p className="uploadError">{error}</p>}
          <button className="analyzeButton" disabled={!file} onClick={analyze}>
            Analyze & match my resume <ArrowRight />
          </button>
          <p className="privacyNote">
            <ShieldCheck /> Your document is read in memory and discarded after
            analysis.
          </p>
        </div>
      </section>
      <section className="resumeHow">
        <span>One upload. Three useful outcomes.</span>
        <div>
          <article>
            <b>01</b>
            <h2>A clear career profile</h2>
            <p>
              Skills, seniority, transferable strengths, and realistic target
              roles.
            </p>
          </article>
          <article>
            <b>02</b>
            <h2>Evidence-based matching</h2>
            <p>
              See exactly what aligns and what is missing for every opportunity.
            </p>
          </article>
          <article>
            <b>03</b>
            <h2>Direct application links</h2>
            <p>Go from analysis to verified employer-hosted job pages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
