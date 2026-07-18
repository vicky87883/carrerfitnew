import { rateLimit } from "@/app/api/_utils";
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, isAdminEmail, totpUri, validTotp } from "@/server/admin-mfa";
import { markRequestMfaVerified, privateJson, requireAdminUser, validateMutationOrigin } from "@/server/auth";
import { getAdminMfa, upsertAdminMfa } from "@/server/auth-store";
import type { SessionUser } from "@/server/auth-store";
import { databaseBackend, getMysqlPool } from "@/server/mysql";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path[0] || "overview";
    if (path === "mfa") return mfaStatus(request);
    if (path === "overview") return overview(request);
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}

export async function POST(request: Request, context: Context) {
  const originError = validateMutationOrigin(request); if (originError) return originError;
  try {
    const path = (await context.params).path[0];
    if (path === "mfa-setup") return setupMfa(request);
    if (path === "mfa-confirm") return confirmMfa(request);
    if (path === "mfa-verify") return verifyMfa(request);
    return privateJson({ message: "Admin route not found." }, 404);
  } catch { return privateJson({ message: "The administrator service is temporarily unavailable." }, 503); }
}

async function mfaStatus(request: Request) {
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  const mfa = await getAdminMfa(user.id);
  return privateJson({ admin: true, configured: Boolean(mfa?.enabledAt), verified: Boolean((user as SessionUser).mfaVerifiedAt) });
}
async function setupMfa(request: Request) {
  const limited = rateLimit(request, "admin-mfa-setup", 5); if (limited) return limited;
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  const existing = await getAdminMfa(user.id);
  if (existing?.enabledAt) return privateJson({ message: "Authenticator MFA is already enabled." }, 409);
  const secret = generateTotpSecret(); await upsertAdminMfa(user.id, encryptMfaSecret(secret), false);
  return privateJson({ secret, otpauthUri: totpUri(user.email, secret), account: user.email });
}
async function confirmMfa(request: Request) {
  const limited = rateLimit(request, "admin-mfa-confirm", 8); if (limited) return limited;
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  const body = await request.json() as { code?: string }; const mfa = await getAdminMfa(user.id);
  if (!mfa) return privateJson({ message: "Start authenticator setup first." }, 400);
  if (!validTotp(decryptMfaSecret(mfa.secretCiphertext), String(body.code || ""))) return privateJson({ message: "That authenticator code is not valid. Try the current code." }, 400);
  await upsertAdminMfa(user.id, mfa.secretCiphertext, true); await markRequestMfaVerified(request);
  return privateJson({ ok: true, message: "Authenticator MFA is enabled." });
}
async function verifyMfa(request: Request) {
  const limited = rateLimit(request, "admin-mfa-verify", 10); if (limited) return limited;
  const { user, response } = await requireAdminUser(request, false); if (response || !user) return response!;
  const body = await request.json() as { code?: string }; const mfa = await getAdminMfa(user.id);
  if (!mfa?.enabledAt) return privateJson({ message: "Authenticator MFA has not been set up." }, 400);
  if (!validTotp(decryptMfaSecret(mfa.secretCiphertext), String(body.code || ""))) return privateJson({ message: "That authenticator code is not valid. Try the current code." }, 401);
  await markRequestMfaVerified(request); return privateJson({ ok: true });
}
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
