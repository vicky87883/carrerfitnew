import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { databaseBackend, getMysqlPool } from "./mysql.js";
import { getSqliteJobDatabase } from "./job-database.js";

export const ADMIN_COOKIE = "carrerfit_admin";
const accessSeconds = 8 * 60 * 60;
const confirmSeconds = 15 * 60;

export function adminConfigured() { return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_USERNAME && (process.env.ADMIN_PASSWORD || "").length >= 16 && (process.env.AUTH_SECRET || "").length >= 32); }
export function adminEmail() { return (process.env.ADMIN_EMAIL || "").trim().toLowerCase(); }
export function adminCredentialsValid(email: string, username: string, password: string) {
  return safeEquals(email.trim().toLowerCase(), adminEmail()) && safeEquals(username.trim(), process.env.ADMIN_USERNAME || "") && safeEquals(password, process.env.ADMIN_PASSWORD || "");
}
export async function createConfirmationToken() {
  const token = randomBytes(32).toString("base64url"); const now = new Date(); const expires = new Date(now.getTime() + confirmSeconds * 1000);
  if (databaseBackend() === "mysql") { const pool = await getMysqlPool(); await pool.execute("DELETE FROM admin_access_tokens WHERE expires_at<UTC_TIMESTAMP(3)"); await pool.execute("INSERT INTO admin_access_tokens (token_hash,expires_at,created_at) VALUES (?,?,?)", [sha256(token), mysqlDate(expires), mysqlDate(now)]); }
  else { const db = getSqliteJobDatabase(); ensureSqliteTokens(); db.prepare("DELETE FROM admin_access_tokens WHERE expires_at<datetime('now')").run(); db.prepare("INSERT INTO admin_access_tokens VALUES (?,?,?)").run(sha256(token), expires.toISOString(), now.toISOString()); }
  return token;
}
export async function confirmationValid(token: string) {
  if (token.length < 32 || token.length > 100) return false; const hash = sha256(token); const now = new Date();
  if (databaseBackend() === "mysql") { const pool = await getMysqlPool(); const [result] = await pool.execute<import("mysql2/promise").ResultSetHeader>("DELETE FROM admin_access_tokens WHERE token_hash=? AND expires_at>?", [hash, mysqlDate(now)]); return result.affectedRows === 1; }
  const db = getSqliteJobDatabase(); ensureSqliteTokens(); return db.prepare("DELETE FROM admin_access_tokens WHERE token_hash=? AND expires_at>?").run(hash, now.toISOString()).changes === 1;
}
export function createAdminCookie() { return `${ADMIN_COOKIE}=${signedToken(accessSeconds)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${accessSeconds}${secure() ? "; Secure" : ""}`; }
export function clearAdminCookie() { return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? "; Secure" : ""}`; }
export function adminSession(request: Request) { return validToken(readCookie(request, ADMIN_COOKIE)); }

function signedToken(seconds: number) { const payload = Buffer.from(JSON.stringify({ exp: Date.now() + seconds * 1000, nonce: randomBytes(16).toString("base64url") })).toString("base64url"); return `${payload}.${sign(payload)}`; }
function validToken(value: string | null) { if (!value) return false; const [payload, signature] = value.split("."); if (!payload || !signature || !safeEquals(signature, sign(payload))) return false; try { const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number }; return typeof data.exp === "number" && data.exp > Date.now(); } catch { return false; } }
function sign(value: string) { return createHmac("sha256", process.env.AUTH_SECRET || "").update(`admin:${value}`).digest("base64url"); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function safeEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function readCookie(request: Request, name: string) { const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null; }
function secure() { return process.env.NODE_ENV === "production" || (process.env.APP_URL || "").startsWith("https://"); }
function ensureSqliteTokens() { getSqliteJobDatabase().exec("CREATE TABLE IF NOT EXISTS admin_access_tokens (token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)"); }
function mysqlDate(value: Date) { return value.toISOString().slice(0, 23).replace("T", " "); }
