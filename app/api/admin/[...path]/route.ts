import { rateLimit } from "@/app/api/_utils";
import { adminConfigured, adminCredentialsValid, adminSession, clearAdminCookie, confirmationValid, createAdminCookie, createConfirmationToken } from "@/server/admin-access";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { sendAdminAccessEmail } from "@/server/mailer";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import { getSqliteJobDatabase } from "@/server/job-database";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const path = (await context.params).path[0] || "status";
  if (path === "confirm") return confirm(request);
  if (path === "status") return privateJson({ configured: adminConfigured(), authenticated: adminSession(request) });
  if (path === "overview") return overview(request);
  if (path === "users") return users(request);
  return privateJson({ message: "Admin route not found." }, 404);
}
export async function POST(request: Request, context: Context) {
  const originError = validateMutationOrigin(request); if (originError) return originError;
  try {
    const path = (await context.params).path[0];
    if (path === "request-access") return requestAccess(request);
    if (path === "cleanup-jobs") return cleanupJobs(request);
    if (path === "logout") return privateJson({ ok: true }, 200, { "Set-Cookie": clearAdminCookie() });
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}
async function requestAccess(request: Request) {
  const limited = rateLimit(request, "admin-access", 5); if (limited) return limited;
  if (!adminConfigured()) return privateJson({ message: "Administrator credentials are not configured on the server." }, 503);
  const body = await request.json() as { email?: string; username?: string; password?: string };
  if (!adminCredentialsValid(String(body.email || ""), String(body.username || ""), String(body.password || ""))) return privateJson({ message: "Administrator email, username, or password is incorrect." }, 401);
  await sendAdminAccessEmail(createConfirmationToken());
  return privateJson({ message: "Confirmation link sent. Open it from the administrator mailbox to continue." });
}
function confirm(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!confirmationValid(token)) return Response.redirect(new URL("/admin?confirmation=invalid", request.url), 303);
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
  const query = `SELECT u.id,u.name,u.email,u.email_verified_at,u.last_login_at,u.created_at,p.updated_at AS private_updated_at,p.resume_profile,
    (SELECT COUNT(*) FROM user_applications a WHERE a.user_id=u.id) AS application_count
    FROM users u LEFT JOIN user_private_data p ON p.user_id=u.id ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 100`;
  let rows: Array<RowDataPacket & Record<string, unknown>>;
  if (databaseBackend() === "mysql") [rows] = await (await getMysqlPool()).query<(RowDataPacket & Record<string, unknown>)[]>(query);
  else rows = getSqliteJobDatabase().prepare(query).all() as Array<RowDataPacket & Record<string, unknown>>;
  return privateJson({ users: rows.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), verified: Boolean(row.email_verified_at), lastLoginAt: row.last_login_at || null, createdAt: row.created_at || null, lastActivityAt: row.private_updated_at || row.last_login_at || row.created_at || null, applications: Number(row.application_count || 0), resume: profileSummary(row.resume_profile) })) });
}
async function cleanupJobs(request: Request) {
  if (!adminSession(request)) return privateJson({ message: "Confirm an administrator sign-in first." }, 401);
  let removed = 0;
  if (databaseBackend() === "mysql") { const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("DELETE FROM imported_jobs WHERE last_seen_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)"); removed = result.affectedRows; }
  else removed = getSqliteJobDatabase().prepare("DELETE FROM imported_jobs WHERE last_seen_at < datetime('now','-30 days')").run().changes;
  return privateJson({ removed });
}
function profileSummary(value: unknown) { try { const profile = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : null; return profile ? { headline: String(profile.headline || profile.targetRole || "Resume uploaded").slice(0, 160), skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 8) : [] } : null; } catch { return null; } }
