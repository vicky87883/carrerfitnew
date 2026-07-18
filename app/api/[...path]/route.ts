import { timingSafeEqual } from "node:crypto";
import { apiFailure, rateLimit, resumeFileFromForm } from "@/app/api/_utils";
import type { AssessmentAnswers, CareerMatch, Job } from "@/lib/types";
import { jobs } from "@/server/data/jobs";
import { analyzeResumeWithGroq, hydrateRankedJobs } from "@/server/groq";
import {
  createJobSource, deleteJobSource, getImportedJob, getJobSource, getJobSourceOverview,
  listImportedJobs, listJobSources, setJobSourceEnabled,
} from "@/server/job-database";
import { identifyJobSource, ScrapeError, scrapeJobSource, validateJobSourceUrl } from "@/server/job-scraper";
import { extractResumeText } from "@/server/resume";
import { readStore, writeStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const activeScrapes = new Set<string>();

export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "jobs" && path.length === 1) return listJobs(request);
    if (path[0] === "jobs" && path[1]) {
      const job = await findJob(path[1]);
      return job ? Response.json(job) : Response.json({ message: "Job not found" }, { status: 404 });
    }
    if (path[0] === "job-sources" && path.length === 1) {
      const denied = requireAdmin(request); if (denied) return denied;
      return Response.json(await getJobSourceOverview());
    }
    if (path[0] === "dashboard") return dashboard();
    return notFound();
  } catch (error) { return routeFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "resume" && path[1] === "analyze") return analyzeResume(request);
    if (path[0] === "job-sources") {
      const denied = requireAdmin(request); if (denied) return denied;
      const limited = rateLimit(request, "job-sources", 30); if (limited) return limited;
      if (path[1] === "scrape-all") return scrapeAll();
      if (path[1] && path[2] === "scrape") return scrapeOne(path[1]);
      if (path.length === 1) return addSource(request);
    }
    if (path[0] === "cron" && path[1] === "job-sources") return cronScrape(request);
    if (path[0] === "assessment") return createAssessment(request);
    if (path[0] === "applications" && path.length === 1) return createApplication(request);
    return notFound();
  } catch (error) { return routeFailure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "job-sources" && path[1]) {
      const denied = requireAdmin(request); if (denied) return denied;
      const body = await request.json() as { enabled?: unknown };
      if (typeof body.enabled !== "boolean") return Response.json({ message: "Provide an enabled state." }, { status: 400 });
      const source = await setJobSourceEnabled(path[1], body.enabled);
      return source ? Response.json(source) : Response.json({ message: "Job source not found." }, { status: 404 });
    }
    if (path[0] === "applications" && path[1]) {
      const body = await request.json() as { status?: string };
      const allowed = ["Saved", "Applied", "Interview", "Offer"] as const;
      if (!allowed.includes(body.status as typeof allowed[number])) return Response.json({ message: "Invalid status" }, { status: 400 });
      const store = await readStore(); const application = store.applications.find((item) => item.id === path[1]);
      if (!application) return Response.json({ message: "Application not found" }, { status: 404 });
      application.status = body.status as typeof application.status; await writeStore(store); return Response.json(application);
    }
    return notFound();
  } catch (error) { return routeFailure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "job-sources" && path[1]) {
      const denied = requireAdmin(request); if (denied) return denied;
      return await deleteJobSource(path[1]) ? new Response(null, { status: 204 }) : Response.json({ message: "Job source not found." }, { status: 404 });
    }
    if (path[0] === "applications" && path[1]) {
      const store = await readStore(); const before = store.applications.length;
      store.applications = store.applications.filter((item) => item.id !== path[1]);
      if (store.applications.length === before) return Response.json({ message: "Application not found" }, { status: 404 });
      await writeStore(store); return new Response(null, { status: 204 });
    }
    return notFound();
  } catch (error) { return routeFailure(error); }
}

async function listJobs(request: Request) {
  const url = new URL(request.url); const q = (url.searchParams.get("q") || "").toLowerCase();
  const category = url.searchParams.get("category") || "All"; const mode = url.searchParams.get("mode") || "All";
  const curated = jobs.filter((job) => {
    const haystack = [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (category === "All" || job.category === category) && (mode === "All" || job.workMode === mode);
  });
  const result = dedupeJobs([...curated, ...await listImportedJobs({ q, category, mode, limit: 500 })]);
  return Response.json({ jobs: result, total: result.length });
}

async function analyzeResume(request: Request) {
  const limited = rateLimit(request, "resume", 20); if (limited) return limited;
  const form = await request.formData(); const file = await resumeFileFromForm(form.get("resume"));
  if (!file) return Response.json({ message: "Choose a PDF or DOCX resume to analyze." }, { status: 400 });
  const text = await extractResumeText(file); const availableJobs = dedupeJobs([...jobs, ...await listImportedJobs({ limit: 80 })]);
  const analysis = await analyzeResumeWithGroq(text, availableJobs);
  return Response.json({ profile: analysis.profile, jobs: hydrateRankedJobs(availableJobs, analysis), aiPowered: analysis.aiPowered, file: { name: file.originalname, type: file.mimetype, size: file.size, charactersRead: text.length }, analyzedAt: new Date().toISOString() }, { status: 201 });
}

async function addSource(request: Request) {
  const body = await request.json() as { url?: string; name?: string };
  const url = String(body.url || "").slice(0, 1000); const name = String(body.name || "").slice(0, 100);
  await validateJobSourceUrl(url); const identified = identifyJobSource(url, name);
  let source;
  try { source = await createJobSource(identified); }
  catch (error) { if (error instanceof Error && error.message.includes("UNIQUE")) return Response.json({ message: "This job source already exists." }, { status: 409 }); throw error; }
  try {
    const result = await runSourceScrape(source.id);
    return Response.json({ source: await getJobSource(source.id), imported: result.imported }, { status: 201 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "The source could not be imported.", source: await getJobSource(source.id) }, { status: error instanceof ScrapeError ? error.status : 422 });
  }
}

async function scrapeAll() {
  const enabled = (await listJobSources()).filter((source) => source.enabled);
  const results = await Promise.allSettled(enabled.map((source) => runSourceScrape(source.id)));
  return Response.json({ refreshed: fulfilled(results), failed: rejected(results), overview: await getJobSourceOverview() });
}
async function scrapeOne(id: string) {
  const source = await getJobSource(id); if (!source) return Response.json({ message: "Job source not found." }, { status: 404 });
  const result = await runSourceScrape(source.id); return Response.json({ source: await getJobSource(source.id), imported: result.imported });
}
async function cronScrape(request: Request) {
  if (!secureMatch(request.headers.get("x-cron-secret") || "", process.env.CRON_SECRET || "")) return Response.json({ message: "Invalid cron credential." }, { status: 401 });
  const enabled = (await listJobSources()).filter((source) => source.enabled);
  const results = await Promise.allSettled(enabled.map((source) => runSourceScrape(source.id)));
  return Response.json({ refreshed: fulfilled(results), failed: rejected(results) });
}

async function createAssessment(request: Request) {
  const answers = await request.json() as Partial<AssessmentAnswers>;
  if (!answers.interests?.length || !answers.strengths?.length || !answers.workStyle || answers.experience === undefined || !answers.goal) return Response.json({ message: "Please complete every assessment section." }, { status: 400 });
  const interest = answers.interests[0]; const roleMap: Record<string, string[]> = {
    "Data & insights": ["Product Analyst", "Growth Data Analyst", "Business Systems Analyst"],
    "Design & creativity": ["Product Designer", "UX Researcher", "Content Designer"],
    "People & communication": ["Customer Success Manager", "Product Marketer", "UX Researcher"],
    "Systems & operations": ["RevOps Specialist", "Business Systems Analyst", "Product Operations Manager"],
  };
  const matches: CareerMatch[] = (roleMap[interest] || roleMap["Data & insights"]).map((role, index) => ({
    role, score: Math.max(78, 95 - index * 6 + Math.min(3, Math.floor((answers.experience || 0) / 2))),
    summary: `${role} aligns with your interest in ${interest.toLowerCase()} and your ${answers.workStyle!.toLowerCase()} work style.`, strengths: answers.strengths!.slice(0, 3),
    gaps: index === 0 ? ["Portfolio proof", "Domain vocabulary"] : ["Role-specific tools", "Interview stories"], nextSteps: ["Save two matching roles", "Complete one proof-of-skill project", "Practice a role-specific interview"],
  }));
  const store = await readStore(); store.matches = matches; await writeStore(store); return Response.json({ matches }, { status: 201 });
}

async function createApplication(request: Request) {
  const body = await request.json() as { jobId?: string }; const job = await findJob(String(body.jobId || ""));
  if (!job) return Response.json({ message: "Job not found" }, { status: 404 });
  const store = await readStore(); const existing = store.applications.find((item) => item.jobId === job.id);
  if (existing) return Response.json(existing);
  const application = { id: crypto.randomUUID(), jobId: job.id, status: "Saved" as const, createdAt: new Date().toISOString() };
  store.applications.push(application); await writeStore(store); return Response.json(application, { status: 201 });
}

async function dashboard() {
  const store = await readStore();
  const applications = (await Promise.all(store.applications.map(async (application) => {
    const job = await findJob(application.jobId); return job ? { ...application, job } : null;
  }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return Response.json({ profile: { name: "Candidate", email: "Private career workspace", completion: store.matches.length ? 82 : 45 }, matches: store.matches, applications, stats: { saved: applications.filter((x) => x.status === "Saved").length, applied: applications.filter((x) => x.status !== "Saved").length, interviews: applications.filter((x) => x.status === "Interview").length, readiness: store.matches.length ? 84 : 52 } });
}

async function runSourceScrape(id: string) {
  if (activeScrapes.has(id)) throw new ScrapeError("This source is already being refreshed.", 409);
  const source = await getJobSource(id); if (!source) throw new ScrapeError("Job source not found.", 404);
  activeScrapes.add(id); try { return await scrapeJobSource(source); } finally { activeScrapes.delete(id); }
}
async function findJob(id: string) { return jobs.find((item) => item.id === id) || await getImportedJob(id); }
function dedupeJobs(items: Job[]) { return [...new Map(items.map((job) => [job.applyUrl.replace(/\/?apply\/?$/, "").replace(/\/$/, ""), job])).values()]; }
function requireAdmin(request: Request) {
  const configured = process.env.SCRAPER_ADMIN_TOKEN || "";
  if (configured.length < 16) return Response.json({ message: "Set SCRAPER_ADMIN_TOKEN to manage job sources." }, { status: 503 });
  return secureMatch(request.headers.get("x-admin-token") || "", configured) ? null : Response.json({ message: "Invalid job-source admin token." }, { status: 401 });
}
function secureMatch(value: string, expected: string) { if (!value || !expected) return false; const left = Buffer.from(value); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right); }
function fulfilled(results: PromiseSettledResult<unknown>[]) { return results.filter((result) => result.status === "fulfilled").length; }
function rejected(results: PromiseSettledResult<unknown>[]) { return results.filter((result) => result.status === "rejected").length; }
function notFound() { return Response.json({ message: "API route not found" }, { status: 404 }); }
function routeFailure(error: unknown) { if (error instanceof ScrapeError) return Response.json({ message: error.message }, { status: error.status }); return apiFailure(error); }
