import { rateLimit } from "@/app/api/_utils";
import {
  appUrl, authConfigurationOk, authRequired, clearSessionCookie, createOneTimeToken, hashPassword,
  issueSession, mailConfigured, normalizeEmail, passwordMatches, passwordPolicy, privateJson,
  revokeRequestSession, safeNext, sessionForRequest, tokenHash, validEmail, validateMutationOrigin,
} from "@/server/auth";
import {
  consumeAuthToken, createAuthToken, createUser, deleteUserSessions, findUserByEmail, findUserById,
  markUserVerified, recordLoginFailure, recordLoginSuccess, updatePassword,
} from "@/server/auth-store";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path;
    if (path[0] === "config") return privateJson({ required: authRequired(), configured: authConfigurationOk(), emailConfigured: mailConfigured() });
    if (path[0] === "me") {
      const user = await sessionForRequest(request);
      return privateJson({ authenticated: Boolean(user?.emailVerifiedAt), required: authRequired(), user: user?.emailVerifiedAt ? publicUser(user) : null });
    }
    if (path[0] === "verify") return verifyEmail(request);
    return privateJson({ message: "Authentication route not found." }, 404);
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const originError = validateMutationOrigin(request); if (originError) return originError;
    const path = (await context.params).path;
    if (path[0] === "register") return register(request);
    if (path[0] === "login") return login(request);
    if (path[0] === "logout") return logout(request);
    if (path[0] === "forgot-password") return forgotPassword(request);
    if (path[0] === "reset-password") return resetPassword(request);
    if (path[0] === "resend-verification") return resendVerification(request);
    return privateJson({ message: "Authentication route not found." }, 404);
  } catch (error) { return authFailure(error); }
}

async function register(request: Request) {
  const limited = rateLimit(request, "auth-register", 8); if (limited) return limited;
  if (!authConfigurationOk()) return privateJson({ message: "Account email is not configured yet." }, 503);
  const body = await request.json() as Record<string, unknown>; const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 100); const password = String(body.password || "");
  if (!validEmail(email) || name.length < 2) return privateJson({ message: "Enter your name and a valid email address." }, 400);
  const passwordError = passwordPolicy(password); if (passwordError) return privateJson({ message: passwordError }, 400);
  const existing = await findUserByEmail(email);
  if (existing) {
    await passwordMatches(existing.passwordHash, password);
    if (!existing.emailVerifiedAt) await sendVerification(existing);
    return privateJson({ message: "If this address can be registered, a confirmation email has been sent." }, 202);
  }
  const user = await createUser(email, name, await hashPassword(password));
  await sendVerification(user);
  return privateJson({ message: "Check your email and confirm your address to open your dashboard." }, 201);
}

async function login(request: Request) {
  const limited = rateLimit(request, "auth-login", 10); if (limited) return limited;
  if (!authConfigurationOk()) return privateJson({ message: "Authentication is not configured yet." }, 503);
  const body = await request.json() as Record<string, unknown>; const email = normalizeEmail(body.email); const password = String(body.password || "");
  const user = validEmail(email) ? await findUserByEmail(email) : null;
  const locked = Boolean(user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
  const valid = await passwordMatches(user?.passwordHash || null, password);
  if (!user || !valid || locked) { if (user && !locked) await recordLoginFailure(user); return privateJson({ message: "Email or password is incorrect. Try again shortly if the account is locked." }, 401); }
  if (!user.emailVerifiedAt) return privateJson({ message: "Confirm your email address before signing in.", code: "email_verification_required" }, 403);
  await recordLoginSuccess(user.id); const session = await issueSession(request, user.id);
  return privateJson({ user: publicUser(user), next: safeNext(String(body.next || "")) }, 200, { "Set-Cookie": session.cookie });
}

async function logout(request: Request) {
  await revokeRequestSession(request);
  return privateJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function forgotPassword(request: Request) {
  const limited = rateLimit(request, "auth-forgot", 5); if (limited) return limited;
  if (!authConfigurationOk()) return privateJson({ message: "Account email is not configured yet." }, 503);
  const body = await request.json() as Record<string, unknown>; const email = normalizeEmail(body.email);
  if (validEmail(email)) { const user = await findUserByEmail(email); if (user?.emailVerifiedAt) await sendReset(user); }
  return privateJson({ message: "If an account exists for that address, a reset link has been sent." }, 202);
}

async function resetPassword(request: Request) {
  const limited = rateLimit(request, "auth-reset", 8); if (limited) return limited;
  const body = await request.json() as Record<string, unknown>; const raw = String(body.token || ""); const password = String(body.password || "");
  const passwordError = passwordPolicy(password); if (passwordError) return privateJson({ message: passwordError }, 400);
  if (raw.length < 32 || raw.length > 100) return privateJson({ message: "This reset link is invalid or expired." }, 400);
  const userId = await consumeAuthToken(tokenHash(raw), "reset_password");
  if (!userId) return privateJson({ message: "This reset link is invalid or expired." }, 400);
  await updatePassword(userId, await hashPassword(password)); await deleteUserSessions(userId);
  return privateJson({ message: "Password updated. Sign in with your new password." });
}

async function resendVerification(request: Request) {
  const limited = rateLimit(request, "auth-resend", 4); if (limited) return limited;
  if (!authConfigurationOk()) return privateJson({ message: "Account email is not configured yet." }, 503);
  const body = await request.json() as Record<string, unknown>; const email = normalizeEmail(body.email);
  if (validEmail(email)) { const user = await findUserByEmail(email); if (user && !user.emailVerifiedAt) await sendVerification(user); }
  return privateJson({ message: "If the account is waiting for confirmation, a new email has been sent." }, 202);
}

async function verifyEmail(request: Request) {
  const raw = new URL(request.url).searchParams.get("token") || "";
  if (raw.length < 32 || raw.length > 100) return Response.redirect(appUrl("/login?verification=invalid"), 303);
  const userId = await consumeAuthToken(tokenHash(raw), "verify_email");
  if (!userId) return Response.redirect(appUrl("/login?verification=invalid"), 303);
  await markUserVerified(userId); const session = await issueSession(request, userId);
  return new Response(null, { status: 303, headers: { Location: appUrl("/dashboard?verified=1"), "Set-Cookie": session.cookie, "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
}

async function sendVerification(user: { id: string; email: string; name: string }) { const token = createOneTimeToken(); await createAuthToken(user.id, "verify_email", token.hash, new Date(Date.now() + 24 * 60 * 60_000).toISOString()); await sendVerificationEmail({ email: user.email, name: user.name, token: token.raw }); }
async function sendReset(user: { id: string; email: string; name: string }) { const token = createOneTimeToken(); await createAuthToken(user.id, "reset_password", token.hash, new Date(Date.now() + 30 * 60_000).toISOString()); await sendPasswordResetEmail({ email: user.email, name: user.name, token: token.raw }); }
function publicUser(user: { id: string; email: string; name: string; emailVerifiedAt: string | null }) { return { id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.emailVerifiedAt) }; }
function authFailure(error: unknown) { const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""; if (code === "ER_DUP_ENTRY" || code === "SQLITE_CONSTRAINT_UNIQUE") return privateJson({ message: "If this address can be registered, a confirmation email has been sent." }, 202); console.error("Authentication request failed", code || "auth_error"); return privateJson({ message: "The secure account service is temporarily unavailable." }, 503); }
