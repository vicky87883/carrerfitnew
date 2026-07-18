import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { AuthUser } from "./auth-store.js";
import { createSession, deleteSession, findSessionUser } from "./auth-store.js";

export const SESSION_COOKIE = "carrerfit_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
let dummyHash: Promise<string> | null = null;

export function authRequired() { return /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED || ""); }
export function mailConfigured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM); }
export function authConfigurationOk() { return (process.env.AUTH_SECRET || "").length >= 32 && mailConfigured(); }

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 });
}
export async function passwordMatches(hash: string | null, password: string) {
  try {
    if (!hash) { dummyHash ||= hashPassword("not-a-real-user-password"); await argon2.verify(await dummyHash, password); return false; }
    return await argon2.verify(hash, password);
  } catch { return false; }
}
export function passwordPolicy(password: string) {
  if (password.length < 12 || password.length > 128) return "Use a password between 12 and 128 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return "Include an uppercase letter, lowercase letter, and number.";
  return null;
}
export function normalizeEmail(value: unknown) { return String(value || "").trim().toLowerCase().slice(0, 254); }
export function validEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

export function createOneTimeToken() { const raw = randomBytes(32).toString("base64url"); return { raw, hash: sha256(raw) }; }
export function tokenHash(raw: string) { return sha256(raw); }

export async function sessionForRequest(request: Request) {
  const raw = readCookie(request, SESSION_COOKIE); if (!raw) return null;
  return findSessionUser(sha256(raw));
}
export async function requireVerifiedUser(request: Request) {
  if (!authRequired()) return { user: null as AuthUser | null, response: null as Response | null };
  if (!authConfigurationOk()) return { user: null, response: privateJson({ message: "Authentication is not completely configured." }, 503) };
  const user = await sessionForRequest(request);
  if (!user) return { user: null, response: privateJson({ message: "Please sign in to continue.", code: "authentication_required" }, 401) };
  if (!user.emailVerifiedAt) return { user: null, response: privateJson({ message: "Confirm your email address to continue.", code: "email_verification_required" }, 403) };
  return { user, response: null };
}

export async function issueSession(request: Request, userId: string) {
  const raw = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await createSession({ tokenHash: sha256(raw), userId, expiresAt, userAgentHash: fingerprint(request.headers.get("user-agent")), ipHash: fingerprint(clientIp(request)) });
  return { raw, cookie: sessionCookie(raw, SESSION_SECONDS) };
}
export async function revokeRequestSession(request: Request) { const raw = readCookie(request, SESSION_COOKIE); if (raw) await deleteSession(sha256(raw)); }
export function clearSessionCookie() { return sessionCookie("", 0); }
export function sessionCookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" || (process.env.APP_URL || "").startsWith("https://");
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV === "test" ? null : privateJson({ message: "Request origin is required." }, 403);
  let expected: string;
  try { expected = new URL(process.env.APP_URL || request.url).origin; } catch { return privateJson({ message: "Server origin is invalid." }, 503); }
  return origin === expected ? null : privateJson({ message: "Cross-site request blocked." }, 403);
}
export function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"; }
export function privateJson(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache", ...headers } });
}
export function appUrl(path: string) { return new URL(path, process.env.APP_URL || process.env.WEB_URL || "http://localhost:3000").toString(); }

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function fingerprint(value: string | null) { if (!value) return null; return sha256(`${process.env.AUTH_SECRET || "local"}:${value}`); }
function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"); }
function readCookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
