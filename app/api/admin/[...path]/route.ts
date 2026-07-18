import { rateLimit } from "@/app/api/_utils";
import { timingSafeEqual } from "node:crypto";
import { markRequestMfaVerified, privateJson, requireAdminUser, validateMutationOrigin } from "@/server/auth";
import type { SessionUser } from "@/server/auth-store";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path[0] || "overview";
    if (path === "status") return status(request);
    if (path === "overview") return overview(request);
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}

export async function POST(request: Request, context: Context) {
  const originError = validateMutationOrigin(request); if (originError) return originError;
  try {
    const path = (await context.params).path[0];
    if (path === "unlock") return unlock(request);
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}

async function status(request: Request) {
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  return privateJson({ admin: true, unlocked: Boolean((user as SessionUser).mfaVerifiedAt), passwordConfigured: adminPasswordConfigured() });
}
async function unlock(request: Request) {
  const limited = rateLimit(request, "admin-unlock", 8); if (limited) return limited;
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  if (!adminPasswordConfigured()) return privateJson({ message: "ADMIN_PASSWORD is not configured on the server." }, 503);
  const body = await request.json() as { password?: string }; const supplied = String(body.password || ""); const expected = process.env.ADMIN_PASSWORD || "";
  if (!safeEquals(supplied, expected)) return privateJson({ message: "Administrator password is incorrect." }, 401);
  await markRequestMfaVerified(request); return privateJson({ ok: true });
}
function adminPasswordConfigured() { return (process.env.ADMIN_PASSWORD || "").length >= 16; }
function safeEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
async function overview(request: Request) {
  const { response } = await requireAdminUser(request); if (response) return response;
  if (databaseBackend() !== "mysql") return privateJson({ database: "sqlite", stats: null });
  const pool = await getMysqlPool();
  const [[users], [jobs], [sources], [posts]] = await Promise.all([
    pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM users"), pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM imported_jobs WHERE active=1"),
    pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM job_sources WHERE enabled=1"), pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM blog_posts WHERE status='Published'"),
  ]);
  return privateJson({ database: "mysql", stats: { users: Number(users[0]?.count || 0), activeJobs: Number(jobs[0]?.count || 0), sources: Number(sources[0]?.count || 0), publishedPosts: Number(posts[0]?.count || 0) } });
}
