import { rateLimit } from "@/app/api/_utils";
import { adminConfigured, adminCredentialsValid, adminSession, clearAdminCookie, confirmationValid, createAdminCookie, createConfirmationToken } from "@/server/admin-access";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { sendAdminAccessEmail } from "@/server/mailer";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const path = (await context.params).path[0] || "status";
  if (path === "confirm") return confirm(request);
  if (path === "status") return privateJson({ configured: adminConfigured(), authenticated: adminSession(request) });
  if (path === "overview") return overview(request);
  return privateJson({ message: "Admin route not found." }, 404);
}
export async function POST(request: Request, context: Context) {
  const originError = validateMutationOrigin(request); if (originError) return originError;
  try {
    const path = (await context.params).path[0];
    if (path === "request-access") return requestAccess(request);
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
