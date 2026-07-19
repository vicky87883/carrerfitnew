import { rateLimit } from "@/app/api/_utils";
import { adminConfigured, adminCredentialsValid, adminSession, clearAdminCookie, confirmationValid, createAdminCookie, createConfirmationToken } from "@/server/admin-access";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { sendAdminAccessEmail } from "@/server/mailer";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import { getSqliteJobDatabase } from "@/server/job-database";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createHash, randomUUID } from "node:crypto";
import { getResumeFile } from "@/server/resume-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const parts = (await context.params).path; const path = parts[0] || "status";
  if (path === "confirm") return confirm(request);
  if (path === "status") return privateJson({ configured: adminConfigured(), authenticated: adminSession(request), sessionHours: 8 });
  if (!adminSession(request)) return privateJson({ message: "Administrator authentication is required." }, 401);
  if (path === "overview") return overview(request);
  if (path === "users") return users(request);
  if (path === "resume" && parts[1]) return resumeFile(parts[1]);
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
    if (path === "logout") return privateJson({ ok: true }, 200, { "Set-Cookie": clearAdminCookie() });
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}
async function requestAccess(request: Request) {
  const limited = rateLimit(request, "admin-access", 5); if (limited) return limited;
  if (!adminConfigured()) return privateJson({ message: "Administrator credentials are not configured on the server." }, 503);
  const body = await request.json() as { email?: string; username?: string; password?: string };
  if (!adminCredentialsValid(String(body.email || ""), String(body.username || ""), String(body.password || ""))) return privateJson({ message: "Administrator email, username, or password is incorrect." }, 401);
  await sendAdminAccessEmail(await createConfirmationToken());
  return privateJson({ message: "Confirmation link sent. Open it from the administrator mailbox to continue." });
}
async function confirm(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!await confirmationValid(token)) return Response.redirect(new URL("/admin?confirmation=invalid", request.url), 303);
  return new Response(null, { status: 303, headers: { Location: new URL("/admin?confirmed=1", request.url).toString(), "Set-Cookie": createAdminCookie(), "Cache-Control": "no-store" } });
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
    EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.expires_at>UTC_TIMESTAMP(3)) AS logged_in
    FROM users u LEFT JOIN user_private_data p ON p.user_id=u.id LEFT JOIN user_resume_files r ON r.user_id=u.id ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 100`;
  const sqliteQuery = `SELECT u.id,u.name,u.email,u.email_verified_at,u.last_login_at,u.created_at,p.updated_at AS private_updated_at,p.resume_profile,r.filename,r.size_bytes,r.uploaded_at,
    (SELECT COUNT(*) FROM user_applications a WHERE a.user_id=u.id) AS application_count,
    EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.expires_at>datetime('now')) AS logged_in
    FROM users u LEFT JOIN user_private_data p ON p.user_id=u.id LEFT JOIN user_resume_files r ON r.user_id=u.id ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 100`;
  let rows: Array<RowDataPacket & Record<string, unknown>>;
  if (databaseBackend() === "mysql") [rows] = await (await getMysqlPool()).query<(RowDataPacket & Record<string, unknown>)[]>(mysqlQuery);
  else rows = getSqliteJobDatabase().prepare(sqliteQuery).all() as Array<RowDataPacket & Record<string, unknown>>;
  return privateJson({ users: rows.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), verified: Boolean(row.email_verified_at), loggedIn: Boolean(row.logged_in), lastLoginAt: row.last_login_at || null, createdAt: row.created_at || null, lastActivityAt: row.private_updated_at || row.last_login_at || row.created_at || null, applications: Number(row.application_count || 0), resume: profileSummary(row.resume_profile), resumeFile: row.filename ? { filename: String(row.filename), size: Number(row.size_bytes || 0), uploadedAt: row.uploaded_at } : null })) });
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

async function manualJob(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const title = String(body.title || "").trim().slice(0, 180); const company = String(body.company || "").trim().slice(0, 120); const location = String(body.location || "").trim().slice(0, 200);
  const applyUrl = String(body.applyUrl || "").trim().slice(0, 1000); const description = String(body.description || "").trim().slice(0, 20_000); const workMode = ["Remote", "Hybrid", "On-site"].includes(String(body.workMode)) ? String(body.workMode) : "Remote";
  if (title.length < 3 || company.length < 2 || description.length < 30 || !applyUrl.startsWith("https://")) return privateJson({ message: "Provide a title, company, HTTPS apply URL, and a useful description." }, 400);
  const id = `manual-${randomUUID()}`; const sourceId = "manual-admin-source"; const now = new Date().toISOString(); const skills = String(body.skills || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  if (databaseBackend() === "mysql") { const pool = await getMysqlPool(); await pool.execute("INSERT IGNORE INTO job_sources (id,name,url,url_hash,type,enabled,created_at,last_status) VALUES (?,?,?,?,?,1,?,'Success')", [sourceId, "Manual admin posts", "https://carrerfit.com/admin", createHash("sha256").update("https://carrerfit.com/admin").digest("hex"), "Structured data", mysqlDate(now)]); await pool.execute(`INSERT INTO imported_jobs (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,active,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, [id, id, sourceId, "Company careers", "Manual admin posts", title, company, location || "Remote", workMode, description, applyUrl, mysqlDate(now), JSON.stringify(skills), "[]", String(body.category || "General").slice(0, 80), String(body.level || "Not specified").slice(0, 80), mysqlDate(now), mysqlDate(now)]); }
  else { const db = getSqliteJobDatabase(); db.prepare("INSERT OR IGNORE INTO job_sources (id,name,url,type,enabled,created_at,last_status) VALUES (?,?,?,?,1,?,'Success')").run(sourceId, "Manual admin posts", "https://carrerfit.com/admin", "Structured data", now); db.prepare(`INSERT INTO imported_jobs (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,active,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(id, id, sourceId, "Company careers", "Manual admin posts", title, company, location || "Remote", workMode, description, applyUrl, now, JSON.stringify(skills), "[]", String(body.category || "General"), String(body.level || "Not specified"), now, now); }
  return privateJson({ id, title, company }, 201);
}
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
