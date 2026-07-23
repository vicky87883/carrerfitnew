import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Job, JobSource, JobSourceOverview } from "../lib/types.js";
import { checkMysqlConnection, closeMysqlPoolForTests, databaseBackend, getMysqlPool } from "./mysql.js";

export type SourceKind = JobSource["type"];
export type ImportedJob = {
  externalId: string; title: string; company: string; location: string; workMode: Job["workMode"];
  description: string; applyUrl: string; postedAt: string | null; skills: string[]; requirements: string[];
  category: string; level: string;
};

type SourceRow = {
  id: string; name: string; url: string; type: SourceKind; enabled: number | boolean; created_at: string;
  last_scraped_at: string | null; last_status: JobSource["lastStatus"]; last_error: string | null;
  last_import_count: number; active_job_count: number;
};
type JobRow = {
  id: string; external_id: string; source_id: string; source_type: Job["source"]; source_name: string;
  title: string; company: string; location: string; work_mode: Job["workMode"]; description: string;
  apply_url: string; posted_at: string | null; skills: string; requirements: string; category: string;
  level: string; last_seen_at: string;
};

let sqlite: Database.Database | null = null;

export function getSqliteJobDatabase() {
  if (sqlite) return sqlite;
  const file = process.env.CARRERFIT_DB_PATH || join(process.env.CARRERFIT_DATA_DIR || join(process.cwd(), "server", "data"), "carrerfit.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS job_sources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_scraped_at TEXT,
      last_status TEXT NOT NULL DEFAULT 'Pending', last_error TEXT, last_import_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS imported_jobs (
      id TEXT PRIMARY KEY, external_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL, source_name TEXT NOT NULL, title TEXT NOT NULL, company TEXT NOT NULL,
      location TEXT NOT NULL, work_mode TEXT NOT NULL, description TEXT NOT NULL, apply_url TEXT NOT NULL,
      posted_at TEXT, skills TEXT NOT NULL, requirements TEXT NOT NULL, category TEXT NOT NULL, level TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      UNIQUE(source_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS imported_jobs_active_idx ON imported_jobs(active, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS imported_jobs_search_idx ON imported_jobs(title, company, category);
    CREATE TABLE IF NOT EXISTS job_bot_runs (
      id TEXT PRIMARY KEY, trigger_type TEXT NOT NULL, status TEXT NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 0, refreshed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS job_bot_runs_started_idx ON job_bot_runs(started_at DESC);
  `);
  sqlite.prepare("UPDATE job_sources SET enabled=0,last_status='Success',last_error=NULL WHERE id='manual-admin-source'").run();
  return sqlite;
}

export async function createJobSource(input: { name: string; url: string; type: SourceKind }) {
  const id = randomUUID(); const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    try {
      await (await getMysqlPool()).execute(
        "INSERT INTO job_sources (id,name,url,url_hash,type,created_at) VALUES (?,?,?,?,?,?)",
        [id, input.name, input.url, urlHash(input.url), input.type, mysqlDate(now)],
      );
    } catch (error) {
      if (isDuplicate(error)) throw new Error("UNIQUE job source URL");
      throw error;
    }
  } else {
    getSqliteJobDatabase().prepare("INSERT INTO job_sources (id,name,url,type,created_at) VALUES (?,?,?,?,?)").run(id, input.name, input.url, input.type, now);
  }
  return (await getJobSource(id))!;
}

export async function getJobSource(id: string) {
  const query = `SELECT s.*, (SELECT COUNT(*) FROM imported_jobs j WHERE j.source_id=s.id AND j.active=1) active_job_count FROM job_sources s WHERE s.id=?`;
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<(SourceRow & RowDataPacket)[]>(query, [id]);
    return rows[0] ? mapSource(rows[0]) : null;
  }
  const row = getSqliteJobDatabase().prepare(query).get(id) as SourceRow | undefined;
  return row ? mapSource(row) : null;
}

export async function findJobSourceByUrl(url: string) {
  const query = `SELECT s.*, (SELECT COUNT(*) FROM imported_jobs j WHERE j.source_id=s.id AND j.active=1) active_job_count FROM job_sources s WHERE s.url=? LIMIT 1`;
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<(SourceRow & RowDataPacket)[]>(query, [url]); return rows[0] ? mapSource(rows[0]) : null; }
  const row = getSqliteJobDatabase().prepare(query).get(url) as SourceRow | undefined; return row ? mapSource(row) : null;
}

export async function listJobSources() {
  const query = `SELECT s.*, (SELECT COUNT(*) FROM imported_jobs j WHERE j.source_id=s.id AND j.active=1) active_job_count FROM job_sources s ORDER BY s.created_at DESC`;
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).query<(SourceRow & RowDataPacket)[]>(query);
    return rows.map(mapSource);
  }
  return (getSqliteJobDatabase().prepare(query).all() as SourceRow[]).map(mapSource);
}

export async function setJobSourceEnabled(id: string, enabled: boolean) {
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE job_sources SET enabled=? WHERE id=?", [enabled ? 1 : 0, id]);
  else getSqliteJobDatabase().prepare("UPDATE job_sources SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
  return getJobSource(id);
}

export async function deleteJobSource(id: string) {
  if (databaseBackend() === "mysql") {
    const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("DELETE FROM job_sources WHERE id=?", [id]);
    return result.affectedRows > 0;
  }
  return getSqliteJobDatabase().prepare("DELETE FROM job_sources WHERE id=?").run(id).changes > 0;
}

export async function markSourceRunning(id: string) {
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE job_sources SET last_status='Running', last_error=NULL WHERE id=?", [id]);
  else getSqliteJobDatabase().prepare("UPDATE job_sources SET last_status='Running', last_error=NULL WHERE id=?").run(id);
}

export async function markSourceFailed(id: string, message: string) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE job_sources SET last_status='Failed', last_error=?, last_scraped_at=? WHERE id=?", [message.slice(0, 500), mysqlDate(now), id]);
  else getSqliteJobDatabase().prepare("UPDATE job_sources SET last_status='Failed', last_error=?, last_scraped_at=? WHERE id=?").run(message.slice(0, 500), now, id);
}

export async function replaceSourceJobs(source: JobSource, jobs: ImportedJob[]) {
  const now = new Date().toISOString();
  if (databaseBackend() === "mysql") {
    const connection = await (await getMysqlPool()).getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE imported_jobs SET active=0 WHERE source_id=?", [source.id]);
      for (const job of jobs) {
        await connection.execute(`INSERT INTO imported_jobs
          (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,first_seen_at,last_seen_at,active)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
          ON DUPLICATE KEY UPDATE source_type=VALUES(source_type),source_name=VALUES(source_name),title=VALUES(title),company=VALUES(company),location=VALUES(location),work_mode=VALUES(work_mode),description=VALUES(description),apply_url=VALUES(apply_url),posted_at=VALUES(posted_at),skills=VALUES(skills),requirements=VALUES(requirements),category=VALUES(category),level=VALUES(level),last_seen_at=VALUES(last_seen_at),active=1`,
        mysqlJobValues(source, job, now));
      }
      await connection.execute("UPDATE job_sources SET last_status='Success',last_error=NULL,last_scraped_at=?,last_import_count=? WHERE id=?", [mysqlDate(now), jobs.length, source.id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return;
  }

  const db = getSqliteJobDatabase();
  const upsert = db.prepare(`INSERT INTO imported_jobs
    (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,first_seen_at,last_seen_at,active)
    VALUES (@id,@externalId,@sourceId,@sourceType,@sourceName,@title,@company,@location,@workMode,@description,@applyUrl,@postedAt,@skills,@requirements,@category,@level,@now,@now,1)
    ON CONFLICT(source_id,external_id) DO UPDATE SET source_type=excluded.source_type,source_name=excluded.source_name,title=excluded.title,company=excluded.company,location=excluded.location,work_mode=excluded.work_mode,description=excluded.description,apply_url=excluded.apply_url,posted_at=excluded.posted_at,skills=excluded.skills,requirements=excluded.requirements,category=excluded.category,level=excluded.level,last_seen_at=excluded.last_seen_at,active=1`);
  db.transaction(() => {
    db.prepare("UPDATE imported_jobs SET active=0 WHERE source_id=?").run(source.id);
    for (const job of jobs) upsert.run({ ...job, id: `imported-${randomUUID()}`, sourceId: source.id, sourceType: dbSourceType(source), sourceName: source.name, skills: JSON.stringify(job.skills), requirements: JSON.stringify(job.requirements), now });
    db.prepare("UPDATE job_sources SET last_status='Success',last_error=NULL,last_scraped_at=?,last_import_count=? WHERE id=?").run(now, jobs.length, source.id);
  })();
}

export async function listImportedJobs(options: { q?: string; category?: string; mode?: string; limit?: number } = {}) {
  const clauses = ["active=1"]; const values: (string | number | boolean | null)[] = [];
  if (options.q) { clauses.push("(LOWER(title) LIKE ? OR LOWER(company) LIKE ? OR LOWER(skills) LIKE ?)"); const q = `%${options.q.toLowerCase()}%`; values.push(q, q, q); }
  if (options.category && options.category !== "All") { clauses.push("category=?"); values.push(options.category); }
  if (options.mode && options.mode !== "All") { clauses.push("work_mode=?"); values.push(options.mode); }
  const limit = Math.min(options.limit || 500, 1000);
  const query = `SELECT * FROM imported_jobs WHERE ${clauses.join(" AND ")} ORDER BY COALESCE(posted_at,last_seen_at) DESC LIMIT ${limit}`;
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<(JobRow & RowDataPacket)[]>(query, values);
    return rows.map(mapJob);
  }
  return (getSqliteJobDatabase().prepare(query).all(...values) as JobRow[]).map(mapJob);
}

export async function getImportedJob(id: string) {
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).execute<(JobRow & RowDataPacket)[]>("SELECT * FROM imported_jobs WHERE id=? AND active=1", [id]);
    return rows[0] ? mapJob(rows[0]) : null;
  }
  const row = getSqliteJobDatabase().prepare("SELECT * FROM imported_jobs WHERE id=? AND active=1").get(id) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export async function getJobSourceOverview(): Promise<JobSourceOverview> {
  const sources = await listJobSources();
  let stats: { activeJobs: number; last24Hours: number };
  if (databaseBackend() === "mysql") {
    const [rows] = await (await getMysqlPool()).query<(RowDataPacket & { activeJobs: number; last24Hours: number })[]>(`SELECT COUNT(*) activeJobs, SUM(CASE WHEN first_seen_at >= UTC_TIMESTAMP(3) - INTERVAL 1 DAY THEN 1 ELSE 0 END) last24Hours FROM imported_jobs WHERE active=1`);
    stats = rows[0];
  } else {
    stats = getSqliteJobDatabase().prepare(`SELECT COUNT(*) activeJobs, SUM(CASE WHEN datetime(first_seen_at) >= datetime('now','-1 day') THEN 1 ELSE 0 END) last24Hours FROM imported_jobs WHERE active=1`).get() as typeof stats;
  }
  return {
    sources,
    stats: { sources: sources.length, activeJobs: Number(stats.activeJobs) || 0, last24Hours: Number(stats.last24Hours) || 0, failedSources: sources.filter((source) => source.lastStatus === "Failed").length },
    recentJobs: await listImportedJobs({ limit: 8 }),
  };
}

export async function checkJobDatabaseConnection() {
  if (databaseBackend() === "mysql") return checkMysqlConnection();
  const startedAt = Date.now();
  getSqliteJobDatabase().prepare("SELECT 1").get();
  return { ok: true, backend: "sqlite" as const, latencyMs: Date.now() - startedAt };
}

export async function createJobBotRun(trigger: "cron" | "admin", sourceCount: number) {
  const run = { id: randomUUID(), trigger, status: "Running" as const, sourceCount, refreshed: 0, failed: 0, startedAt: new Date().toISOString(), finishedAt: null as string | null };
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO job_bot_runs (id,trigger_type,status,source_count,started_at) VALUES (?,?,?,?,?)", [run.id, run.trigger, run.status, run.sourceCount, mysqlDate(run.startedAt)]);
  else getSqliteJobDatabase().prepare("INSERT INTO job_bot_runs (id,trigger_type,status,source_count,started_at) VALUES (?,?,?,?,?)").run(run.id, run.trigger, run.status, run.sourceCount, run.startedAt);
  return run;
}

export async function finishJobBotRun(id: string, refreshed: number, failed: number) {
  const finishedAt = new Date().toISOString(); const status = failed === 0 ? "Success" : refreshed > 0 ? "Partial" : "Failed";
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE job_bot_runs SET status=?,refreshed_count=?,failed_count=?,finished_at=? WHERE id=?", [status, refreshed, failed, mysqlDate(finishedAt), id]);
  else getSqliteJobDatabase().prepare("UPDATE job_bot_runs SET status=?,refreshed_count=?,failed_count=?,finished_at=? WHERE id=?").run(status, refreshed, failed, finishedAt, id);
  return { id, status, refreshed, failed, finishedAt };
}

export async function listJobBotRuns(limit = 20) {
  const count = Math.max(1, Math.min(100, limit)); const query = `SELECT id,trigger_type,status,source_count,refreshed_count,failed_count,started_at,finished_at FROM job_bot_runs ORDER BY started_at DESC LIMIT ${count}`;
  let rows: Array<{ id: string; trigger_type: string; status: string; source_count: number; refreshed_count: number; failed_count: number; started_at: string; finished_at: string | null }>;
  if (databaseBackend() === "mysql") [rows] = await (await getMysqlPool()).query<(RowDataPacket & typeof rows[number])[]>(query);
  else rows = getSqliteJobDatabase().prepare(query).all() as typeof rows;
  return rows.map((row) => ({ id: row.id, trigger: row.trigger_type, status: row.status, sourceCount: Number(row.source_count), refreshed: Number(row.refreshed_count), failed: Number(row.failed_count), startedAt: iso(row.started_at), finishedAt: row.finished_at ? iso(row.finished_at) : null }));
}

function mapSource(row: SourceRow): JobSource {
  return { id: row.id, name: row.name, url: row.url, type: row.type, enabled: Boolean(row.enabled), createdAt: iso(row.created_at), lastScrapedAt: row.last_scraped_at ? iso(row.last_scraped_at) : null, lastStatus: row.last_status, lastError: row.last_error, lastImportCount: Number(row.last_import_count), activeJobCount: Number(row.active_job_count) || 0 };
}
function mapJob(row: JobRow): Job {
  const posted = row.posted_at ? new Date(iso(row.posted_at)) : new Date(iso(row.last_seen_at));
  return { id: row.id, title: row.title, company: row.company, location: row.location, workMode: row.work_mode, salaryMin: 0, salaryMax: 0, category: row.category, level: row.level, description: row.description, skills: safeArray(row.skills), requirements: safeArray(row.requirements), fitScore: 72, postedDaysAgo: Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86_400_000)), logo: initials(row.company), applyUrl: row.apply_url, source: row.source_type, sourceName: row.source_name, verifiedAt: iso(row.last_seen_at).slice(0, 10), imported: true };
}
function mysqlJobValues(source: JobSource, job: ImportedJob, now: string) {
  return [`imported-${randomUUID()}`, job.externalId, source.id, dbSourceType(source), source.name, job.title, job.company, job.location, job.workMode, job.description, job.applyUrl, job.postedAt ? mysqlDate(job.postedAt) : null, JSON.stringify(job.skills), JSON.stringify(job.requirements), job.category, job.level, mysqlDate(now), mysqlDate(now)];
}
function dbSourceType(source: JobSource) { return source.type === "Structured data" ? "Company careers" : source.type; }
function urlHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function isDuplicate(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY"); }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
function safeArray(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "JOB"; }

export async function closeJobDatabaseForTests() {
  sqlite?.close(); sqlite = null;
  await closeMysqlPoolForTests();
}
