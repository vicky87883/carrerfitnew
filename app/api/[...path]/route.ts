import { timingSafeEqual } from "node:crypto";
import { apiFailure, rateLimit, resumeFileFromForm } from "@/app/api/_utils";
import type { AssessmentAnswers, CareerMatch, Job } from "@/lib/types";
import { privateJson, requireVerifiedUser, validateMutationOrigin } from "@/server/auth";
import { adminSession } from "@/server/admin-access";
import {
  createUserApplication, deleteUserApplication, getPrivateData, listUserApplications,
  saveAssessmentMatches, saveResumeAnalysis, updateUserApplication,
} from "@/server/auth-store";
import { jobs } from "@/server/data/jobs";
import { analyzeResumeWithGroq, hydrateRankedJobs } from "@/server/groq";
import {
  createJobSource, deleteJobSource, getImportedJob, getJobSource, getJobSourceOverview,
  listImportedJobs, listJobSources, setJobSourceEnabled,
} from "@/server/job-database";
import { identifyJobSource, ScrapeError, scrapeJobSource, validateJobSourceUrl } from "@/server/job-scraper";
import { extractResumeText } from "@/server/resume";
import { saveResumeFile } from "@/server/resume-vault";
import { readStore, writeStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const activeScrapes = new Set<string>();

export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "jobs" && path.length === 1) return await listJobs(request);
    if (path[0] === "jobs" && path[1]) {
      const job = await findJob(path[1]);
      return job ? Response.json(job) : Response.json({ message: "Job not found" }, { status: 404 });
    }
    if (path[0] === "job-sources" && path.length === 1) {
      const denied = requireAdmin(request); if (denied) return denied;
      return Response.json(await getJobSourceOverview());
    }
    if (path[0] === "dashboard") return await dashboard(request);
    return notFound();
  } catch (error) { return routeFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (!["cron", "job-sources"].includes(path[0])) { const denied = validateMutationOrigin(request); if (denied) return denied; }
    if (path[0] === "resume" && path[1] === "analyze") return await analyzeResume(request);
    if (path[0] === "job-sources") {
      const denied = requireAdmin(request); if (denied) return denied;
      const limited = rateLimit(request, "job-sources", 30); if (limited) return limited;
      if (path[1] === "scrape-all") return await scrapeAll();
      if (path[1] && path[2] === "scrape") return await scrapeOne(path[1]);
      if (path.length === 1) return await addSource(request);
    }
    if (path[0] === "cron" && path[1] === "job-sources") return await cronScrape(request);
    if (path[0] === "assessment") return await createAssessment(request);
    if (path[0] === "applications" && path.length === 1) return await createApplication(request);
    return notFound();
  } catch (error) { return routeFailure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied;
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
      const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
      if (auth.user) return await updateUserApplication(auth.user.id, path[1], body.status as typeof allowed[number]) ? privateJson({ id: path[1], status: body.status }) : privateJson({ message: "Application not found" }, 404);
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
    const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied;
    if (path[0] === "job-sources" && path[1]) {
      const denied = requireAdmin(request); if (denied) return denied;
      return await deleteJobSource(path[1]) ? new Response(null, { status: 204 }) : Response.json({ message: "Job source not found." }, { status: 404 });
    }
    if (path[0] === "applications" && path[1]) {
      const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
      if (auth.user) return await deleteUserApplication(auth.user.id, path[1]) ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store, private" } }) : privateJson({ message: "Application not found" }, 404);
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
  const imported = await importedJobsOrEmpty({ q, category, mode, limit: 500 });
  const result = dedupeJobs([...curated, ...imported.jobs]);
  return Response.json({ jobs: result, total: result.length, databaseDegraded: imported.degraded });
}

async function analyzeResume(request: Request) {
  const limited = rateLimit(request, "resume", 20); if (limited) return limited;
  const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
  const form = await request.formData(); const file = await resumeFileFromForm(form.get("resume"));
  if (!file) return Response.json({ message: "Choose a PDF or DOCX resume to analyze." }, { status: 400 });
  const text = await extractResumeText(file); const imported = await importedJobsOrEmpty({ limit: 80 });
  const availableJobs = dedupeJobs([...jobs, ...imported.jobs]);
  const analysis = await analyzeResumeWithGroq(text, availableJobs); const rankedJobs = hydrateRankedJobs(availableJobs, analysis);
  if (auth.user) await Promise.all([saveResumeAnalysis(auth.user.id, analysis.profile, rankedJobs), saveResumeFile(auth.user.id, file)]);
  return privateJson({ profile: analysis.profile, jobs: rankedJobs, aiPowered: analysis.aiPowered, storedForAccount: Boolean(auth.user), databaseDegraded: imported.degraded, file: { name: file.originalname, type: file.mimetype, size: file.size, charactersRead: text.length }, analyzedAt: new Date().toISOString() }, 201);
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
  const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
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
  if (auth.user) { await saveAssessmentMatches(auth.user.id, matches); return privateJson({ matches }, 201); }
  const store = await readStore(); store.matches = matches; await writeStore(store); return Response.json({ matches }, { status: 201 });
}

async function createApplication(request: Request) {
  const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
  const body = await request.json() as { jobId?: string }; const job = await findJob(String(body.jobId || ""));
  if (!job) return Response.json({ message: "Job not found" }, { status: 404 });
  if (auth.user) return privateJson(await createUserApplication(auth.user.id, job.id), 201);
  const store = await readStore(); const existing = store.applications.find((item) => item.jobId === job.id);
  if (existing) return Response.json(existing);
  const application = { id: crypto.randomUUID(), jobId: job.id, status: "Saved" as const, createdAt: new Date().toISOString() };
  store.applications.push(application); await writeStore(store); return Response.json(application, { status: 201 });
}

async function dashboard(request: Request) {
  const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
  if (auth.user) {
    const [privateData, saved] = await Promise.all([getPrivateData(auth.user.id), listUserApplications(auth.user.id)]);
    const applications = (await Promise.all(saved.map(async (application) => { const job = await findJob(application.jobId); return job ? { ...application, job } : null; }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const completion = privateData.resumeProfile ? 90 : privateData.assessmentMatches.length ? 68 : 35;
    return privateJson({ profile: { name: auth.user.name, email: auth.user.email, completion }, resumeProfile: privateData.resumeProfile, resumeJobs: privateData.resumeJobs.slice(0, 5), matches: privateData.assessmentMatches, applications, stats: { saved: applications.filter((x) => x.status === "Saved").length, applied: applications.filter((x) => x.status !== "Saved").length, interviews: applications.filter((x) => x.status === "Interview").length, readiness: privateData.resumeProfile ? 86 : privateData.assessmentMatches.length ? 70 : 45 } });
  }
  let store: Awaited<ReturnType<typeof readStore>>; let databaseDegraded = false;
  try { store = await readStore(); }
  catch { store = { applications: [], matches: [] }; databaseDegraded = true; }
  const applications = (await Promise.all(store.applications.map(async (application) => {
    const job = await findJob(application.jobId); return job ? { ...application, job } : null;
  }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return Response.json({ profile: { name: "Candidate", email: "Private career workspace", completion: store.matches.length ? 82 : 45 }, matches: store.matches, applications, databaseDegraded, stats: { saved: applications.filter((x) => x.status === "Saved").length, applied: applications.filter((x) => x.status !== "Saved").length, interviews: applications.filter((x) => x.status === "Interview").length, readiness: store.matches.length ? 84 : 52 } });
}

async function runSourceScrape(id: string) {
  if (activeScrapes.has(id)) throw new ScrapeError("This source is already being refreshed.", 409);
  const source = await getJobSource(id); if (!source) throw new ScrapeError("Job source not found.", 404);
  activeScrapes.add(id); try { return await scrapeJobSource(source); } finally { activeScrapes.delete(id); }
}
async function findJob(id: string) {
  const curated = jobs.find((item) => item.id === id); if (curated) return curated;
  try { return await getImportedJob(id); } catch { return null; }
}
async function importedJobsOrEmpty(options: Parameters<typeof listImportedJobs>[0]) {
  try { return { jobs: await listImportedJobs(options), degraded: false }; }
  catch (error) {
    console.error("Imported jobs unavailable", error && typeof error === "object" && "code" in error ? error.code : "database_error");
    return { jobs: [] as Job[], degraded: true };
  }
}
function dedupeJobs(items: Job[]) { return [...new Map(items.map((job) => [job.applyUrl.replace(/\/?apply\/?$/, "").replace(/\/$/, ""), job])).values()]; }
function requireAdmin(request: Request) {
  if (adminSession(request)) return null;
  const configured = process.env.SCRAPER_ADMIN_TOKEN || "";
  if (configured.length < 16) return Response.json({ message: "Set SCRAPER_ADMIN_TOKEN to manage job sources." }, { status: 503 });
  return secureMatch(request.headers.get("x-admin-token") || "", configured) ? null : Response.json({ message: "Invalid job-source admin token." }, { status: 401 });
}
function secureMatch(value: string, expected: string) { if (!value || !expected) return false; const left = Buffer.from(value); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right); }
function fulfilled(results: PromiseSettledResult<unknown>[]) { return results.filter((result) => result.status === "fulfilled").length; }
function rejected(results: PromiseSettledResult<unknown>[]) { return results.filter((result) => result.status === "rejected").length; }
function notFound() { return Response.json({ message: "API route not found" }, { status: 404 }); }
function routeFailure(error: unknown) { if (error instanceof ScrapeError) return Response.json({ message: error.message }, { status: error.status }); return apiFailure(error); }
