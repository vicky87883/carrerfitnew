import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { hashPassword, passwordMatches } from "./auth.js";
import { databaseBackend, getMysqlPool } from "./mysql.js";
import { getSqliteJobDatabase } from "./job-database.js";

export const ADMIN_COOKIE = "carrerfit_admin";
const accessSeconds = 8 * 60 * 60;
const confirmSeconds = 15 * 60;

export function adminConfigured() { return Boolean(adminEmail() && process.env.ADMIN_USERNAME && (process.env.ADMIN_PASSWORD || "").length >= 12 && (process.env.AUTH_SECRET || "").length >= 32); }
export function adminEmail() { return (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS?.split(",")[0] || "").trim().toLowerCase(); }
export async function adminLoginConfigured() {
  if ((process.env.AUTH_SECRET || "").length < 32) return false;
  if (adminConfigured()) return true;
  ensureSqliteAdmin();
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM administrator_accounts WHERE active=1"); return Number(rows[0]?.count || 0) > 0; }
  const row = getSqliteJobDatabase().prepare("SELECT COUNT(*) count FROM administrator_accounts WHERE active=1").get() as { count: number };
  return Number(row.count) > 0;
}
export async function adminCredentialsValid(username: string, password: string) {
  const normalized = username.trim().slice(0, 100); ensureSqliteAdmin();
  if (adminConfigured() && safeEquals(normalized, process.env.ADMIN_USERNAME || "") && safeEquals(password, process.env.ADMIN_PASSWORD || "")) {
    await bootstrapAdmin(normalized, password);
    return true;
  }
  let account: { id: string; username: string; password_hash: string; failed_login_count: number; locked_until: string | null } | undefined;
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<(RowDataPacket & typeof account)[]>("SELECT id,username,password_hash,failed_login_count,locked_until FROM administrator_accounts WHERE username=? AND active=1 LIMIT 1", [normalized]); account = rows[0]; }
  else account = getSqliteJobDatabase().prepare("SELECT id,username,password_hash,failed_login_count,locked_until FROM administrator_accounts WHERE username=? AND active=1 LIMIT 1").get(normalized) as typeof account;
  const locked = Boolean(account?.locked_until && new Date(iso(account.locked_until)).getTime() > Date.now());
  const valid = await passwordMatches(account?.password_hash || null, password);
  if (!account || !valid || locked) { if (account && !locked) await recordAdminFailure(account.id, Number(account.failed_login_count) + 1); return false; }
  await recordAdminSuccess(account.id); return true;
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
function ensureSqliteAdmin() { if (databaseBackend() === "sqlite") getSqliteJobDatabase().exec(`CREATE TABLE IF NOT EXISTS administrator_accounts (
  id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
  failed_login_count INTEGER NOT NULL DEFAULT 0,locked_until TEXT,last_login_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
)`); }
async function bootstrapAdmin(username: string, password: string) {
  const id = randomUUID(); const now = new Date().toISOString(); const hash = await hashPassword(password);
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute(
    `INSERT INTO administrator_accounts (id,username,password_hash,active,failed_login_count,locked_until,last_login_at,created_at,updated_at)
     VALUES (?,?,?,1,0,NULL,?,?,?)
     ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),active=1,failed_login_count=0,locked_until=NULL,last_login_at=VALUES(last_login_at),updated_at=VALUES(updated_at)`,
    [id, username, hash, mysqlDate(new Date(now)), mysqlDate(new Date(now)), mysqlDate(new Date(now))],
  );
  else getSqliteJobDatabase().prepare(
    `INSERT INTO administrator_accounts (id,username,password_hash,active,failed_login_count,locked_until,last_login_at,created_at,updated_at)
     VALUES (?,?,?,1,0,NULL,?,?,?)
     ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,active=1,failed_login_count=0,locked_until=NULL,last_login_at=excluded.last_login_at,updated_at=excluded.updated_at`,
  ).run(id, username, hash, now, now, now);
}
async function recordAdminFailure(id: string, failures: number) {
  const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE administrator_accounts SET failed_login_count=?,locked_until=?,updated_at=? WHERE id=?", [failures, lockedUntil ? mysqlDate(new Date(lockedUntil)) : null, mysqlDate(new Date()), id]);
  else getSqliteJobDatabase().prepare("UPDATE administrator_accounts SET failed_login_count=?,locked_until=?,updated_at=? WHERE id=?").run(failures, lockedUntil, new Date().toISOString(), id);
}
async function recordAdminSuccess(id: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE administrator_accounts SET failed_login_count=0,locked_until=NULL,last_login_at=?,updated_at=? WHERE id=?", [mysqlDate(new Date(now)), mysqlDate(new Date(now)), id]);
  else getSqliteJobDatabase().prepare("UPDATE administrator_accounts SET failed_login_count=0,locked_until=NULL,last_login_at=?,updated_at=? WHERE id=?").run(now, now, id);
}
function mysqlDate(value: Date) { return value.toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
