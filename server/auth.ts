import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { AuthUser, SessionUser } from "./auth-store.js";
import { createSession, deleteSession, findSessionUser, setSessionMfaVerified } from "./auth-store.js";
import { isAdminEmail } from "./admin-mfa.js";

export const SESSION_COOKIE = "carrerfit_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
let dummyHash: Promise<string> | null = null;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function authRequired() { return /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED || ""); }
export function mailConfigured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM); }
export function authConfigurationOk() { return (process.env.AUTH_SECRET || "").length >= 32 && mailConfigured(); }

export async function hashPassword(password: string) {
  // Node's built-in scrypt is portable across Hostinger's Linux runtime and
  // avoids native-module startup failures during registration.
  const salt = randomBytes(16);
  const derived = await deriveScrypt(password, salt, 32, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
export async function passwordMatches(hash: string | null, password: string) {
  try {
    if (!hash) { dummyHash ||= hashPassword("not-a-real-user-password"); await verifyScrypt(await dummyHash, password); return false; }
    if (hash.startsWith("scrypt$")) return await verifyScrypt(hash, password);
    // Keep existing Argon2id accounts usable when the optional native module is available.
    if (hash.startsWith("$argon2")) {
      const { default: argon2 } = await import("argon2");
      return await argon2.verify(hash, password);
    }
    return false;
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
export async function requireAdminUser(request: Request, requireMfa = true) {
  const result = await requireVerifiedUser(request);
  if (result.response || !result.user) return result;
  if (!isAdminEmail(result.user.email)) return { user: null, response: privateJson({ message: "Administrator access is required." }, 403) };
  const session = result.user as SessionUser;
  if (requireMfa && !session.mfaVerifiedAt) return { user: session, response: privateJson({ message: "Authenticator verification is required.", code: "mfa_required" }, 403) };
  return { user: session, response: null };
}

export async function issueSession(request: Request, userId: string) {
  const raw = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await createSession({ tokenHash: sha256(raw), userId, expiresAt, userAgentHash: fingerprint(request.headers.get("user-agent")), ipHash: fingerprint(clientIp(request)) });
  return { raw, cookie: sessionCookie(raw, SESSION_SECONDS) };
}
export async function revokeRequestSession(request: Request) { const raw = readCookie(request, SESSION_COOKIE); if (raw) await deleteSession(sha256(raw)); }
export async function markRequestMfaVerified(request: Request) { const raw = readCookie(request, SESSION_COOKIE); if (!raw) return false; await setSessionMfaVerified(sha256(raw)); return true; }
export function clearSessionCookie() { return sessionCookie("", 0); }
export function sessionCookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" || (process.env.APP_URL || "").startsWith("https://");
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV === "test" ? null : privateJson({ message: "Request origin is required." }, 403);
  const configured = [process.env.APP_URL, ...(process.env.WEB_URL || "").split(",")]
    .map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const allowed = new Set<string>();
  try {
    for (const value of configured) allowed.add(new URL(value).origin);
    if (!allowed.size) allowed.add(new URL(request.url).origin);
  } catch { return privateJson({ message: "Server origin is invalid." }, 503); }
  return allowed.has(origin) ? null : privateJson({ message: "Cross-site request blocked." }, 403);
}
export function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"; }
export function privateJson(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache", ...headers } });
}
export function appUrl(path: string) { return new URL(path, process.env.APP_URL || process.env.WEB_URL || "http://localhost:3000").toString(); }

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function verifyScrypt(hash: string, password: string) {
  const [, n, r, p, saltValue, derivedValue] = hash.split("$");
  if (!n || !r || !p || !saltValue || !derivedValue) return false;
  const salt = Buffer.from(saltValue, "base64url"); const expected = Buffer.from(derivedValue, "base64url");
  if (salt.length < 16 || expected.length !== 32) return false;
  const derived = await deriveScrypt(password, salt, expected.length, Number(n), Number(r), Number(p));
  return timingSafeEqual(derived, expected);
}
function deriveScrypt(password: string, salt: Buffer, keyLength: number, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    (scryptCallback as unknown as (password: string, salt: Buffer, keyLength: number, options: object, callback: (error: Error | null, derivedKey: Buffer) => void) => void)(password, salt, keyLength, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}
function fingerprint(value: string | null) { if (!value) return null; return sha256(`${process.env.AUTH_SECRET || "local"}:${value}`); }
function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"); }
function readCookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
