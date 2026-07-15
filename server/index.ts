import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import type { AssessmentAnswers, CareerMatch } from "../lib/types.js";
import { jobs } from "./data/jobs.js";
import { analyzeResumeWithGroq, hydrateRankedJobs } from "./groq.js";
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

app.post("/api/resume/analyze", resumeLimiter, resumeUpload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a PDF or DOCX resume to analyze." });
  const text = await extractResumeText(req.file);
  const analysis = await analyzeResumeWithGroq(text, jobs);
  res.status(201).json({
    profile: analysis.profile,
    jobs: hydrateRankedJobs(jobs, analysis),
    aiPowered: analysis.aiPowered,
    file: { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, charactersRead: text.length },
    analyzedAt: new Date().toISOString(),
  });
});

app.get("/api/jobs", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "All");
  const mode = String(req.query.mode || "All");
  const result = jobs.filter((job) => {
    const haystack = [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (category === "All" || job.category === category) && (mode === "All" || job.workMode === mode);
  });
  res.json({ jobs: result, total: result.length });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ message: "Job not found" });
  res.json(job);
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
  const job = jobs.find((item) => item.id === req.body.jobId);
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
    const job = jobs.find((item) => item.id === application.jobId);
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
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "Resume must be smaller than 8 MB." : "The resume upload could not be processed." });
  console.error(error); res.status(500).json({ message: "Something went wrong. Please try again." });
}

export { app };

if (process.env.CARRERFIT_COMBINED_SERVER !== "1") {
  app.use((_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use(apiErrorHandler);
  app.listen(port, () => console.log(`CarrerFit API running on http://localhost:${port}`));
}
