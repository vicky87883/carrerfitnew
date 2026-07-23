import { rateLimit } from "@/app/api/_utils";
import { adminCredentialsValid, adminLoginConfigured, adminSession, clearAdminCookie, createAdminCookie } from "@/server/admin-access";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import { getJobSourceOverview, getSqliteJobDatabase, listJobBotRuns } from "@/server/job-database";
import { runJobBot } from "@/server/job-bot";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createHash, randomUUID } from "node:crypto";
import { getResumeFile } from "@/server/resume-vault";
import { getResumeDocument } from "@/server/resume-vault";
import { getAdminAnalytics } from "@/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const parts = (await context.params).path; const path = parts[0] || "status";
  if (path === "status") return privateJson({ configured: await adminLoginConfigured(), authenticated: adminSession(request), sessionHours: 8 });
  if (!adminSession(request)) return privateJson({ message: "Administrator authentication is required." }, 401);
  if (path === "overview") return overview(request);
  if (path === "bot") return botStatus(request);
  if (path === "analytics") return privateJson(await getAdminAnalytics());
  if (path === "users") return users(request);
  if (path === "resume" && parts[1]) return resumeFile(parts[1]);
  if (path === "resume-json" && parts[1]) return resumeJson(parts[1]);
  return privateJson({ message: "Admin route not found." }, 404);
}
export async function POST(request: Request, context: Context) {
  const originError = validateMutationOrigin(request); if (originError) return originError;
  try {
    const path = (await context.params).path[0];
    if (path === "request-access") return requestAccess(request);
    if (!adminSession(request)) return privateJson({ message: "Administrator authentication is required." }, 401);
    if (path === "cleanup-jobs") return cleanupJobs(request);
    if (path === "manual-job") return manualJob(request);
    if (path === "run-bot") return privateJson(await runJobBot("admin"));
    if (path === "logout") return privateJson({ ok: true }, 200, { "Set-Cookie": clearAdminCookie() });
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}
async function requestAccess(request: Request) {
  const limited = rateLimit(request, "admin-access", 5); if (limited) return limited;
  if (!await adminLoginConfigured()) return privateJson({ message: "Administrator credentials are not configured on the server." }, 503);
  const body = await request.json() as { username?: string; password?: string };
  if (!await adminCredentialsValid(String(body.username || ""), String(body.password || ""))) return privateJson({ message: "Username or password is incorrect. The account locks for 15 minutes after five failed attempts." }, 401);
  return privateJson({ message: "Administrator session opened.", authenticated: true }, 200, { "Set-Cookie": createAdminCookie() });
}
async function overview(request: Request) {
  if (!adminSession(request)) return privateJson({ message: "Confirm an administrator sign-in first." }, 401);
  if (databaseBackend() !== "mysql") return privateJson({ database: "sqlite", stats: null });
  const pool = await getMysqlPool(); const [[users], [jobs], [sources], [posts]] = await Promise.all([
    pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM users"), pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM imported_jobs WHERE active=1"), pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM job_sources WHERE enabled=1"), pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM blog_posts WHERE status='Published'"),
  ]);
  return privateJson({ database: "mysql", stats: { users: Number(users[0]?.count || 0), activeJobs: Number(jobs[0]?.count || 0), sources: Number(sources[0]?.count || 0), publishedPosts: Number(posts[0]?.count || 0) } });
}
async function users(request: Request) {
  if (!adminSession(request)) return privateJson({ message: "Confirm an administrator sign-in first." }, 401);
  const mysqlQuery = `SELECT u.id,u.name,u.email,u.email_verified_at,u.last_login_at,u.created_at,p.updated_at AS private_updated_at,p.resume_profile,r.filename,r.size_bytes,r.uploaded_at,
    (SELECT COUNT(*) FROM user_applications a WHERE a.user_id=u.id) AS application_count,
    (SELECT rr.status FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_status,
    (SELECT rr.ai_powered FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_ai_powered,
    (SELECT rr.ats_score FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_ats_score,
    (SELECT rr.extraction_confidence FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_confidence,
    (SELECT rr.processing_ms FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_processing_ms,
    EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.expires_at>UTC_TIMESTAMP(3)) AS logged_in
    FROM users u LEFT JOIN user_private_data p ON p.user_id=u.id LEFT JOIN user_resume_files r ON r.user_id=u.id ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 100`;
  const sqliteQuery = `SELECT u.id,u.name,u.email,u.email_verified_at,u.last_login_at,u.created_at,p.updated_at AS private_updated_at,p.resume_profile,r.filename,r.size_bytes,r.uploaded_at,
    (SELECT COUNT(*) FROM user_applications a WHERE a.user_id=u.id) AS application_count,
    (SELECT rr.status FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_status,
    (SELECT rr.ai_powered FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_ai_powered,
    (SELECT rr.ats_score FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_ats_score,
    (SELECT rr.extraction_confidence FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_confidence,
    (SELECT rr.processing_ms FROM resume_analysis_runs rr WHERE rr.user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS resume_processing_ms,
    EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.expires_at>datetime('now')) AS logged_in
    FROM users u LEFT JOIN user_private_data p ON p.user_id=u.id LEFT JOIN user_resume_files r ON r.user_id=u.id ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 100`;
  let rows: Array<RowDataPacket & Record<string, unknown>>;
  if (databaseBackend() === "mysql") [rows] = await (await getMysqlPool()).query<(RowDataPacket & Record<string, unknown>)[]>(mysqlQuery);
  else rows = getSqliteJobDatabase().prepare(sqliteQuery).all() as Array<RowDataPacket & Record<string, unknown>>;
  return privateJson({ users: rows.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), verified: Boolean(row.email_verified_at), loggedIn: Boolean(row.logged_in), lastLoginAt: row.last_login_at || null, createdAt: row.created_at || null, lastActivityAt: row.private_updated_at || row.last_login_at || row.created_at || null, applications: Number(row.application_count || 0), resume: profileSummary(row.resume_profile), resumeFile: row.filename ? { filename: String(row.filename), size: Number(row.size_bytes || 0), uploadedAt: row.uploaded_at } : null, resumeProcessing: row.resume_status ? { status: String(row.resume_status), aiPowered: Boolean(row.resume_ai_powered), atsScore: Number(row.resume_ats_score || 0), confidence: Number(row.resume_confidence || 0), processingMs: Number(row.resume_processing_ms || 0) } : null })) });
}
async function botStatus(request: Request) {
  if (!adminSession(request)) return privateJson({ message: "Administrator authentication is required." }, 401);
  const [overview, runs] = await Promise.all([getJobSourceOverview(), listJobBotRuns(20)]);
  return privateJson({ schedule: "17 * * * *", timezone: "UTC", nextRunAt: nextHourlyRun(), overview, runs });
}
async function cleanupJobs(request: Request) {
  if (!adminSession(request)) return privateJson({ message: "Confirm an administrator sign-in first." }, 401);
  let removed = 0;
  if (databaseBackend() === "mysql") { const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("DELETE FROM imported_jobs WHERE last_seen_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)"); removed = result.affectedRows; }
  else removed = getSqliteJobDatabase().prepare("DELETE FROM imported_jobs WHERE last_seen_at < datetime('now','-30 days')").run().changes;
  return privateJson({ removed });
}
function profileSummary(value: unknown) { try { const profile = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : null; return profile ? { headline: String(profile.headline || profile.targetRole || "Resume uploaded").slice(0, 160), skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 8) : [] } : null; } catch { return null; } }

async function resumeFile(userId: string) {
  const file = await getResumeFile(userId); if (!file) return privateJson({ message: "No stored resume file was found." }, 404);
  return new Response(file.data, { headers: { "Content-Type": file.mimeType, "Content-Length": String(file.size), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}
async function resumeJson(userId: string) {
  const value = await getResumeDocument(userId); if (!value) return privateJson({ message: "No structured resume JSON was found." }, 404);
  return privateJson({ schema: "carrerfit.resume.v1", document: value.document, ats: value.ats, metadata: { wordCount: value.wordCount, characterCount: value.characterCount, analyzedAt: value.analyzedAt } });
}

async function manualJob(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const title = String(body.title || "").trim().slice(0, 180); const company = String(body.company || "").trim().slice(0, 120); const location = String(body.location || "").trim().slice(0, 200);
  const applyUrl = String(body.applyUrl || "").trim().slice(0, 1000); const description = String(body.description || "").trim().slice(0, 20_000); const workMode = ["Remote", "Hybrid", "On-site"].includes(String(body.workMode)) ? String(body.workMode) : "Remote";
  if (title.length < 3 || company.length < 2 || description.length < 30 || !applyUrl.startsWith("https://")) return privateJson({ message: "Provide a title, company, HTTPS apply URL, and a useful description." }, 400);
  const id = `manual-${randomUUID()}`; const sourceId = "manual-admin-source"; const now = new Date().toISOString(); const skills = String(body.skills || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  if (databaseBackend() === "mysql") { const pool = await getMysqlPool(); await pool.execute("INSERT IGNORE INTO job_sources (id,name,url,url_hash,type,enabled,created_at,last_status) VALUES (?,?,?,?,?,0,?,'Success')", [sourceId, "Manual admin posts", "https://carrerfit.com/admin", createHash("sha256").update("https://carrerfit.com/admin").digest("hex"), "Structured data", mysqlDate(now)]); await pool.execute(`INSERT INTO imported_jobs (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,active,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, [id, id, sourceId, "Company careers", "Manual admin posts", title, company, location || "Remote", workMode, description, applyUrl, mysqlDate(now), JSON.stringify(skills), "[]", String(body.category || "General").slice(0, 80), String(body.level || "Not specified").slice(0, 80), mysqlDate(now), mysqlDate(now)]); }
  else { const db = getSqliteJobDatabase(); db.prepare("INSERT OR IGNORE INTO job_sources (id,name,url,type,enabled,created_at,last_status) VALUES (?,?,?,?,0,?,'Success')").run(sourceId, "Manual admin posts", "https://carrerfit.com/admin", "Structured data", now); db.prepare(`INSERT INTO imported_jobs (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,active,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(id, id, sourceId, "Company careers", "Manual admin posts", title, company, location || "Remote", workMode, description, applyUrl, now, JSON.stringify(skills), "[]", String(body.category || "General"), String(body.level || "Not specified"), now, now); }
  return privateJson({ id, title, company }, 201);
}
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function nextHourlyRun() { const next = new Date(); next.setUTCMinutes(17, 0, 0); if (next.getTime() <= Date.now()) next.setUTCHours(next.getUTCHours() + 1); return next.toISOString(); }
