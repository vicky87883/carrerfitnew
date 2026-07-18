import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import type { AssessmentAnswers, CareerMatch } from "../lib/types.js";
import { jobs } from "./data/jobs.js";
import { analyzeResumeWithGroq, hydrateRankedJobs } from "./groq.js";
import { createInterviewPlan, evaluateInterviewAnswer, interviewResponseSchema, parseInterviewProfile } from "./interview.js";
import { createJobSource, deleteJobSource, getImportedJob, getJobSource, getJobSourceOverview, listImportedJobs, listJobSources, setJobSourceEnabled } from "./job-database.js";
import { identifyJobSource, ScrapeError, scrapeJobSource, validateJobSourceUrl } from "./job-scraper.js";
import { extractResumeText, ResumeFileError } from "./resume.js";
import { readStore, writeStore } from "./store.js";

const app = express();
const port = Number(process.env.API_PORT || 4000);
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use("/api", helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const allowedOrigins = (process.env.WEB_URL || "http://localhost:3000").split(",").map((origin) => origin.trim());
app.use("/api", cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); } }));
app.use("/api", express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "carrerfit-api", aiConfigured: Boolean(process.env.GROQ_API_KEY) }));

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3 },
});
const resumeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many resume analyses. Please try again in a few minutes." } });
const interviewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 45, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Interview practice limit reached. Please pause for a few minutes." } });
const sourceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Job source refresh limit reached. Please wait a few minutes." } });
const activeScrapes = new Set<string>();

app.post("/api/resume/analyze", resumeLimiter, resumeUpload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a PDF or DOCX resume to analyze." });
  const text = await extractResumeText(req.file);
  const availableJobs = dedupeJobs([...jobs, ...listImportedJobs({ limit: 80 })]);
  const analysis = await analyzeResumeWithGroq(text, availableJobs);
  res.status(201).json({
    profile: analysis.profile,
    jobs: hydrateRankedJobs(availableJobs, analysis),
    aiPowered: analysis.aiPowered,
    file: { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, charactersRead: text.length },
    analyzedAt: new Date().toISOString(),
  });
});

app.post("/api/interview/start", interviewLimiter, resumeUpload.single("resume"), async (req, res) => {
  const totalQuestions = Math.max(3, Math.min(10, Number(req.body.questionCount) || 5));
  const requestedRole = String(req.body.targetRole || "").slice(0, 120);
  let suppliedProfile = null;
  if (req.body.profile) {
    try { suppliedProfile = parseInterviewProfile(JSON.parse(String(req.body.profile))); }
    catch { return res.status(400).json({ message: "The saved resume profile is invalid. Please upload the resume again." }); }
  }
  if (!req.file && !suppliedProfile) return res.status(400).json({ message: "Upload a PDF or DOCX resume to begin." });
  const resumeText = req.file ? await extractResumeText(req.file) : null;
  const plan = await createInterviewPlan(resumeText, suppliedProfile, requestedRole, totalQuestions);
  res.status(201).json(plan);
});

app.post("/api/interview/respond", interviewLimiter, async (req, res) => {
  const parsed = interviewResponseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "The interview answer or session data is invalid." });
  res.json(await evaluateInterviewAnswer(parsed.data));
});

app.get("/api/jobs", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "All");
  const mode = String(req.query.mode || "All");
  const curated = jobs.filter((job) => {
    const haystack = [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (category === "All" || job.category === category) && (mode === "All" || job.workMode === mode);
  });
  const imported = listImportedJobs({ q, category, mode, limit: 500 });
  const result = dedupeJobs([...curated, ...imported]);
  res.json({ jobs: result, total: result.length });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = findJob(req.params.id);
  if (!job) return res.status(404).json({ message: "Job not found" });
  res.json(job);
});

app.get("/api/job-sources", sourceLimiter, requireScraperAdmin, (_req, res) => res.json(getJobSourceOverview()));

app.post("/api/job-sources", sourceLimiter, requireScraperAdmin, async (req, res) => {
  const url = String(req.body.url || "").slice(0, 1000); const name = String(req.body.name || "").slice(0, 100);
  await validateJobSourceUrl(url);
  const identified = identifyJobSource(url, name);
  let source;
  try { source = createJobSource(identified); }
  catch (error) { if (error instanceof Error && error.message.includes("UNIQUE")) return res.status(409).json({ message: "This job source already exists." }); throw error; }
  try {
    const result = await runSourceScrape(source.id);
    res.status(201).json({ source: getJobSource(source.id), imported: result.imported });
  } catch (error) {
    res.status(error instanceof ScrapeError ? error.status : 422).json({ message: error instanceof Error ? error.message : "The source could not be imported.", source: getJobSource(source.id) });
  }
});

app.post("/api/job-sources/scrape-all", sourceLimiter, requireScraperAdmin, async (_req, res) => {
  const enabled = listJobSources().filter((source) => source.enabled);
  const results = await Promise.allSettled(enabled.map((source) => runSourceScrape(source.id)));
  res.json({ refreshed: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length, overview: getJobSourceOverview() });
});

app.post("/api/job-sources/:id/scrape", sourceLimiter, requireScraperAdmin, async (req, res) => {
  const id = String(req.params.id); const source = getJobSource(id); if (!source) return res.status(404).json({ message: "Job source not found." });
  const result = await runSourceScrape(source.id);
  res.json({ source: getJobSource(source.id), imported: result.imported });
});

app.patch("/api/job-sources/:id", sourceLimiter, requireScraperAdmin, (req, res) => {
  if (typeof req.body.enabled !== "boolean") return res.status(400).json({ message: "Provide an enabled state." });
  const source = setJobSourceEnabled(String(req.params.id), req.body.enabled); if (!source) return res.status(404).json({ message: "Job source not found." });
  res.json(source);
});

app.delete("/api/job-sources/:id", sourceLimiter, requireScraperAdmin, (req, res) => {
  if (!deleteJobSource(String(req.params.id))) return res.status(404).json({ message: "Job source not found." });
  res.status(204).end();
});

app.post("/api/cron/job-sources", sourceLimiter, async (req, res) => {
  if (!secureMatch(String(req.headers["x-cron-secret"] || ""), process.env.CRON_SECRET || "")) return res.status(401).json({ message: "Invalid cron credential." });
  const enabled = listJobSources().filter((source) => source.enabled);
  const results = await Promise.allSettled(enabled.map((source) => runSourceScrape(source.id)));
  res.json({ refreshed: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length });
});

app.post("/api/assessment", async (req, res) => {
  const answers = req.body as Partial<AssessmentAnswers>;
  if (!answers.interests?.length || !answers.strengths?.length || !answers.workStyle || answers.experience === undefined || !answers.goal) {
    return res.status(400).json({ message: "Please complete every assessment section." });
  }
  const interest = answers.interests[0];
  const roleMap: Record<string, string[]> = {
    "Data & insights": ["Product Analyst", "Growth Data Analyst", "Business Systems Analyst"],
    "Design & creativity": ["Product Designer", "UX Researcher", "Content Designer"],
    "People & communication": ["Customer Success Manager", "Product Marketer", "UX Researcher"],
    "Systems & operations": ["RevOps Specialist", "Business Systems Analyst", "Product Operations Manager"],
  };
  const roles = roleMap[interest] || roleMap["Data & insights"];
  const workStyle = answers.workStyle;
  const matches: CareerMatch[] = roles.map((role, index) => ({
    role, score: Math.max(78, 95 - index * 6 + Math.min(3, Math.floor((answers.experience || 0) / 2))),
    summary: `${role} aligns with your interest in ${interest.toLowerCase()} and your ${workStyle.toLowerCase()} work style.`,
    strengths: answers.strengths!.slice(0, 3),
    gaps: index === 0 ? ["Portfolio proof", "Domain vocabulary"] : ["Role-specific tools", "Interview stories"],
    nextSteps: ["Save two matching roles", "Complete one proof-of-skill project", "Practice a role-specific interview"],
  }));
  const store = await readStore(); store.matches = matches; await writeStore(store);
  res.status(201).json({ matches });
});

app.post("/api/applications", async (req, res) => {
  const job = findJob(String(req.body.jobId || ""));
  if (!job) return res.status(404).json({ message: "Job not found" });
  const store = await readStore();
  const existing = store.applications.find((item) => item.jobId === job.id);
  if (existing) return res.json(existing);
  const application = { id: crypto.randomUUID(), jobId: job.id, status: "Saved" as const, createdAt: new Date().toISOString() };
  store.applications.push(application); await writeStore(store);
  res.status(201).json(application);
});

app.patch("/api/applications/:id", async (req, res) => {
  const allowed = ["Saved", "Applied", "Interview", "Offer"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid status" });
  const store = await readStore(); const application = store.applications.find((item) => item.id === req.params.id);
  if (!application) return res.status(404).json({ message: "Application not found" });
  application.status = req.body.status; await writeStore(store); res.json(application);
});

app.delete("/api/applications/:id", async (req, res) => {
  const store = await readStore(); const before = store.applications.length;
  store.applications = store.applications.filter((item) => item.id !== req.params.id);
  if (store.applications.length === before) return res.status(404).json({ message: "Application not found" });
  await writeStore(store); res.status(204).end();
});

app.get("/api/dashboard", async (_req, res) => {
  const store = await readStore();
  const applications = store.applications.flatMap((application) => {
    const job = findJob(application.jobId);
    return job ? [{ ...application, job }] : [];
  });
  res.json({
    profile: { name: "Candidate", email: "Private career workspace", completion: store.matches.length ? 82 : 45 },
    matches: store.matches,
    applications,
    stats: { saved: applications.filter((x) => x.status === "Saved").length, applied: applications.filter((x) => x.status !== "Saved").length, interviews: applications.filter((x) => x.status === "Interview").length, readiness: store.matches.length ? 84 : 52 },
  });
});

export function apiErrorHandler(error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) {
  if (error instanceof ResumeFileError) return res.status(error.status).json({ message: error.message });
  if (error instanceof ScrapeError) return res.status(error.status).json({ message: error.message });
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "Resume must be smaller than 8 MB." : "The resume upload could not be processed." });
  console.error(error); res.status(500).json({ message: "Something went wrong. Please try again." });
}

function findJob(id: string) { return jobs.find((item) => item.id === id) || getImportedJob(id); }
function dedupeJobs(items: typeof jobs) { return [...new Map(items.map((job) => [job.applyUrl.replace(/\/?apply\/?$/, "").replace(/\/$/, ""), job])).values()]; }

function requireScraperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configured = process.env.SCRAPER_ADMIN_TOKEN || "";
  if (configured.length < 16) return res.status(503).json({ message: "Set SCRAPER_ADMIN_TOKEN to manage job sources." });
  if (!secureMatch(String(req.headers["x-admin-token"] || ""), configured)) return res.status(401).json({ message: "Invalid job-source admin token." });
  next();
}

function secureMatch(value: string, expected: string) {
  if (!value || !expected) return false; const left = Buffer.from(value); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function runSourceScrape(id: string) {
  if (activeScrapes.has(id)) throw new ScrapeError("This source is already being refreshed.", 409);
  const source = getJobSource(id); if (!source) throw new ScrapeError("Job source not found.", 404);
  activeScrapes.add(id);
  try { return await scrapeJobSource(source); }
  finally { activeScrapes.delete(id); }
}

export { app };

if (process.env.CARRERFIT_COMBINED_SERVER !== "1") {
  app.use((_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use(apiErrorHandler);
  app.listen(port, () => console.log(`CarrerFit API running on http://localhost:${port}`));
}
