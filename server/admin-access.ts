import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "carrerfit_admin";
const accessSeconds = 8 * 60 * 60;
const confirmSeconds = 15 * 60;

export function adminConfigured() { return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_USERNAME && (process.env.ADMIN_PASSWORD || "").length >= 16 && (process.env.AUTH_SECRET || "").length >= 32); }
export function adminEmail() { return (process.env.ADMIN_EMAIL || "").trim().toLowerCase(); }
export function adminCredentialsValid(email: string, username: string, password: string) {
  return safeEquals(email.trim().toLowerCase(), adminEmail()) && safeEquals(username.trim(), process.env.ADMIN_USERNAME || "") && safeEquals(password, process.env.ADMIN_PASSWORD || "");
}
export function createConfirmationToken() { return signedToken(confirmSeconds); }
export function confirmationValid(token: string) { return validToken(token); }
export function createAdminCookie() { return `${ADMIN_COOKIE}=${signedToken(accessSeconds)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${accessSeconds}${secure() ? "; Secure" : ""}`; }
export function clearAdminCookie() { return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? "; Secure" : ""}`; }
export function adminSession(request: Request) { return validToken(readCookie(request, ADMIN_COOKIE)); }

function signedToken(seconds: number) { const payload = Buffer.from(JSON.stringify({ exp: Date.now() + seconds * 1000, nonce: randomBytes(16).toString("base64url") })).toString("base64url"); return `${payload}.${sign(payload)}`; }
function validToken(value: string | null) { if (!value) return false; const [payload, signature] = value.split("."); if (!payload || !signature || !safeEquals(signature, sign(payload))) return false; try { const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number }; return typeof data.exp === "number" && data.exp > Date.now(); } catch { return false; } }
function sign(value: string) { return createHmac("sha256", process.env.AUTH_SECRET || "").update(`admin:${value}`).digest("base64url"); }
function safeEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function readCookie(request: Request, name: string) { const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null; }
function secure() { return process.env.NODE_ENV === "production" || (process.env.APP_URL || "").startsWith("https://"); }
