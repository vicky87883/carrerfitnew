import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Application, CareerMatch, RankedJob, ResumeProfile } from "../lib/types.js";
import { getSqliteJobDatabase } from "./job-database.js";
import { databaseBackend, getMysqlPool } from "./mysql.js";

export type AuthUser = {
  id: string; email: string; name: string; passwordHash: string; emailVerifiedAt: string | null;
  failedLoginCount: number; lockedUntil: string | null; createdAt: string;
};
export type SessionUser = AuthUser & { mfaVerifiedAt: string | null };
export type PrivateData = { resumeProfile: ResumeProfile | null; resumeJobs: RankedJob[]; assessmentMatches: CareerMatch[] };

type UserRow = RowDataPacket & {
  id: string; email: string; name: string; password_hash: string; email_verified_at: string | null;
  failed_login_count: number; locked_until: string | null; created_at: string;
};

export function ensureSqliteAuthSchema() {
  getSqliteJobDatabase().exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
      email_verified_at TEXT, failed_login_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
      last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      user_agent_hash TEXT, ip_hash TEXT, mfa_verified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_mfa (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_ciphertext TEXT NOT NULL, enabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens(user_id, purpose);
    CREATE TABLE IF NOT EXISTS user_private_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, resume_profile TEXT,
      resume_jobs TEXT, assessment_matches TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_applications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS user_applications_user_idx ON user_applications(user_id);
  `);
}

export async function createUser(email: string, name: string, passwordHash: string) {
  const id = randomUUID(); const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    await (await getMysqlPool()).execute(
      "INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      [id, email, name, passwordHash, mysqlDate(now), mysqlDate(now)],
    );
  } else {
    ensureSqliteAuthSchema();
    getSqliteJobDatabase().prepare("INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id, email, name, passwordHash, now, now);
  }
  return (await findUserById(id))!;
}

export async function findUserByEmail(email: string) {
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<UserRow[]>("SELECT * FROM users WHERE email=? LIMIT 1", [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }
  ensureSqliteAuthSchema();
  const row = getSqliteJobDatabase().prepare("SELECT * FROM users WHERE email=? LIMIT 1").get(email) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function findUserById(id: string) {
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<UserRow[]>("SELECT * FROM users WHERE id=? LIMIT 1", [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }
  ensureSqliteAuthSchema();
  const row = getSqliteJobDatabase().prepare("SELECT * FROM users WHERE id=? LIMIT 1").get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function markUserVerified(userId: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?", [mysqlDate(now), mysqlDate(now), userId]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?").run(now, now, userId); }
}

export async function updatePassword(userId: string, passwordHash: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE users SET password_hash=?,failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?", [passwordHash, mysqlDate(now), userId]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("UPDATE users SET password_hash=?,failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?").run(passwordHash, now, userId); }
}

export async function recordLoginFailure(user: AuthUser) {
  const failures = user.failedLoginCount + 1;
  const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE users SET failed_login_count=?,locked_until=? WHERE id=?", [failures, lockedUntil ? mysqlDate(lockedUntil) : null, user.id]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("UPDATE users SET failed_login_count=?,locked_until=? WHERE id=?").run(failures, lockedUntil, user.id); }
}

export async function recordLoginSuccess(userId: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=? WHERE id=?", [mysqlDate(now), userId]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=? WHERE id=?").run(now, userId); }
}

export async function createAuthToken(userId: string, purpose: "verify_email" | "reset_password", tokenHash: string, expiresAt: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    const pool = await getMysqlPool();
    await pool.execute("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?", [userId, purpose]);
    await pool.execute("INSERT INTO auth_tokens (token_hash,user_id,purpose,expires_at,created_at) VALUES (?,?,?,?,?)", [tokenHash, userId, purpose, mysqlDate(expiresAt), mysqlDate(now)]);
  } else {
    ensureSqliteAuthSchema(); const db = getSqliteJobDatabase();
    db.transaction(() => { db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?").run(userId, purpose); db.prepare("INSERT INTO auth_tokens VALUES (?,?,?,?,?)").run(tokenHash, userId, purpose, expiresAt, now); })();
  }
}

export async function consumeAuthToken(tokenHash: string, purpose: "verify_email" | "reset_password") {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    const connection = await (await getMysqlPool()).getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<(RowDataPacket & { user_id: string; expires_at: string })[]>("SELECT user_id,expires_at FROM auth_tokens WHERE token_hash=? AND purpose=? FOR UPDATE", [tokenHash, purpose]);
      const row = rows[0];
      if (!row || new Date(iso(row.expires_at)).getTime() <= Date.now()) { if (row) await connection.execute("DELETE FROM auth_tokens WHERE token_hash=?", [tokenHash]); await connection.commit(); return null; }
      await connection.execute("DELETE FROM auth_tokens WHERE token_hash=?", [tokenHash]);
      await connection.commit(); return row.user_id;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  ensureSqliteAuthSchema(); const db = getSqliteJobDatabase();
  return db.transaction(() => {
    const row = db.prepare("SELECT user_id,expires_at FROM auth_tokens WHERE token_hash=? AND purpose=?").get(tokenHash, purpose) as { user_id: string; expires_at: string } | undefined;
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) { if (row) db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(tokenHash); return null; }
    db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(tokenHash); return row.user_id;
  })();
}

export async function createSession(input: { tokenHash: string; userId: string; expiresAt: string; userAgentHash: string | null; ipHash: string | null }) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO auth_sessions (token_hash,user_id,expires_at,created_at,last_seen_at,user_agent_hash,ip_hash,mfa_verified_at) VALUES (?,?,?,?,?,?,?,NULL)", [input.tokenHash, input.userId, mysqlDate(input.expiresAt), mysqlDate(now), mysqlDate(now), input.userAgentHash, input.ipHash]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("INSERT INTO auth_sessions (token_hash,user_id,expires_at,created_at,last_seen_at,user_agent_hash,ip_hash,mfa_verified_at) VALUES (?,?,?,?,?,?,?,NULL)").run(input.tokenHash, input.userId, input.expiresAt, now, now, input.userAgentHash, input.ipHash); }
}

export async function findSessionUser(tokenHash: string) {
  const query = "SELECT u.*,s.mfa_verified_at AS session_mfa_verified_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1";
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<UserRow[]>(query, [tokenHash, mysqlDate(now)]);
    return rows[0] ? mapSessionUser(rows[0]) : null;
  }
  ensureSqliteAuthSchema(); const row = getSqliteJobDatabase().prepare(query).get(tokenHash, now) as UserRow | undefined;
  return row ? mapSessionUser(row) : null;
}

export async function setSessionMfaVerified(tokenHash: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE auth_sessions SET mfa_verified_at=? WHERE token_hash=?", [mysqlDate(now), tokenHash]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("UPDATE auth_sessions SET mfa_verified_at=? WHERE token_hash=?").run(now, tokenHash); }
}

export async function getAdminMfa(userId: string) {
  const query = "SELECT secret_ciphertext,enabled_at FROM admin_mfa WHERE user_id=? LIMIT 1";
  let row: { secret_ciphertext: string; enabled_at: string | null } | undefined;
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<(RowDataPacket & typeof row)[]>(query, [userId]); row = rows[0]; }
  else { ensureSqliteAuthSchema(); row = getSqliteJobDatabase().prepare(query).get(userId) as typeof row; }
  return row ? { secretCiphertext: row.secret_ciphertext, enabledAt: row.enabled_at ? iso(row.enabled_at) : null } : null;
}
export async function upsertAdminMfa(userId: string, secretCiphertext: string, enabled: boolean) {
  const now = new Date().toISOString(); const enabledAt = enabled ? now : null;
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO admin_mfa (user_id,secret_ciphertext,enabled_at,created_at,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE secret_ciphertext=VALUES(secret_ciphertext),enabled_at=VALUES(enabled_at),updated_at=VALUES(updated_at)", [userId, secretCiphertext, enabledAt ? mysqlDate(enabledAt) : null, mysqlDate(now), mysqlDate(now)]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("INSERT INTO admin_mfa (user_id,secret_ciphertext,enabled_at,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,enabled_at=excluded.enabled_at,updated_at=excluded.updated_at").run(userId, secretCiphertext, enabledAt, now, now); }
}

export async function deleteSession(tokenHash: string) {
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("DELETE FROM auth_sessions WHERE token_hash=?", [tokenHash]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(tokenHash); }
}
export async function deleteUserSessions(userId: string) {
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("DELETE FROM auth_sessions WHERE user_id=?", [userId]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("DELETE FROM auth_sessions WHERE user_id=?").run(userId); }
}

export async function saveResumeAnalysis(userId: string, profile: ResumeProfile, jobs: RankedJob[]) { return savePrivate(userId, "resume", profile, jobs); }
export async function saveAssessmentMatches(userId: string, matches: CareerMatch[]) { return savePrivate(userId, "assessment", matches); }
async function savePrivate(userId: string, kind: "resume" | "assessment", first: unknown, second?: unknown) {
  const now = new Date().toISOString(); const profile = kind === "resume" ? JSON.stringify(first) : null; const resumeJobs = kind === "resume" ? JSON.stringify(second) : null; const matches = kind === "assessment" ? JSON.stringify(first) : null;
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute(`INSERT INTO user_private_data (user_id,resume_profile,resume_jobs,assessment_matches,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE resume_profile=COALESCE(VALUES(resume_profile),resume_profile),resume_jobs=COALESCE(VALUES(resume_jobs),resume_jobs),assessment_matches=COALESCE(VALUES(assessment_matches),assessment_matches),updated_at=VALUES(updated_at)`, [userId, profile, resumeJobs, matches, mysqlDate(now)]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare(`INSERT INTO user_private_data (user_id,resume_profile,resume_jobs,assessment_matches,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET resume_profile=COALESCE(excluded.resume_profile,resume_profile),resume_jobs=COALESCE(excluded.resume_jobs,resume_jobs),assessment_matches=COALESCE(excluded.assessment_matches,assessment_matches),updated_at=excluded.updated_at`).run(userId, profile, resumeJobs, matches, now); }
}

export async function getPrivateData(userId: string): Promise<PrivateData> {
  const query = "SELECT resume_profile,resume_jobs,assessment_matches FROM user_private_data WHERE user_id=?";
  let row: { resume_profile: string | null; resume_jobs: string | null; assessment_matches: string | null } | undefined;
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<(RowDataPacket & typeof row)[]>(query, [userId]); row = rows[0]; }
  else { ensureSqliteAuthSchema(); row = getSqliteJobDatabase().prepare(query).get(userId) as typeof row; }
  return { resumeProfile: parseJson(row?.resume_profile, null), resumeJobs: parseJson(row?.resume_jobs, []), assessmentMatches: parseJson(row?.assessment_matches, []) };
}

export async function createUserApplication(userId: string, jobId: string) {
  const existing = (await listUserApplications(userId)).find((item) => item.jobId === jobId); if (existing) return existing;
  const item: Application = { id: randomUUID(), jobId, status: "Saved", createdAt: new Date().toISOString() };
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO user_applications (id,user_id,job_id,status,created_at) VALUES (?,?,?,?,?)", [item.id, userId, item.jobId, item.status, mysqlDate(item.createdAt)]);
  else { ensureSqliteAuthSchema(); getSqliteJobDatabase().prepare("INSERT INTO user_applications VALUES (?,?,?,?,?)").run(item.id, userId, item.jobId, item.status, item.createdAt); }
  return item;
}
export async function listUserApplications(userId: string): Promise<Application[]> {
  const query = "SELECT id,job_id,status,created_at FROM user_applications WHERE user_id=? ORDER BY created_at DESC";
  let rows: { id: string; job_id: string; status: Application["status"]; created_at: string }[];
  if (databaseBackend() === "mysql") [rows] = await (await getMysqlPool()).execute<(RowDataPacket & typeof rows[number])[]>(query, [userId]);
  else { ensureSqliteAuthSchema(); rows = getSqliteJobDatabase().prepare(query).all(userId) as typeof rows; }
  return rows.map((row) => ({ id: row.id, jobId: row.job_id, status: row.status, createdAt: iso(row.created_at) }));
}
export async function updateUserApplication(userId: string, id: string, status: Application["status"]) {
  let changes = 0;
  if (databaseBackend() === "mysql") { const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("UPDATE user_applications SET status=? WHERE id=? AND user_id=?", [status, id, userId]); changes = result.affectedRows; }
  else { ensureSqliteAuthSchema(); changes = getSqliteJobDatabase().prepare("UPDATE user_applications SET status=? WHERE id=? AND user_id=?").run(status, id, userId).changes; }
  return changes > 0;
}
export async function deleteUserApplication(userId: string, id: string) {
  let changes = 0;
  if (databaseBackend() === "mysql") { const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("DELETE FROM user_applications WHERE id=? AND user_id=?", [id, userId]); changes = result.affectedRows; }
  else { ensureSqliteAuthSchema(); changes = getSqliteJobDatabase().prepare("DELETE FROM user_applications WHERE id=? AND user_id=?").run(id, userId).changes; }
  return changes > 0;
}

function mapUser(row: UserRow): AuthUser { return { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash, emailVerifiedAt: row.email_verified_at ? iso(row.email_verified_at) : null, failedLoginCount: Number(row.failed_login_count), lockedUntil: row.locked_until ? iso(row.locked_until) : null, createdAt: iso(row.created_at) }; }
function mapSessionUser(row: UserRow & { session_mfa_verified_at?: string | null }): SessionUser { return { ...mapUser(row), mfaVerifiedAt: row.session_mfa_verified_at ? iso(row.session_mfa_verified_at) : null }; }
function parseJson<T>(value: string | null | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
