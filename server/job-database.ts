import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job, JobSource, JobSourceOverview } from "../lib/types.js";

export type SourceKind = JobSource["type"];
export type ImportedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  workMode: Job["workMode"];
  description: string;
  applyUrl: string;
  postedAt: string | null;
  skills: string[];
  requirements: string[];
  category: string;
  level: string;
};

type SourceRow = {
  id: string; name: string; url: string; type: SourceKind; enabled: number; created_at: string;
  last_scraped_at: string | null; last_status: JobSource["lastStatus"]; last_error: string | null;
  last_import_count: number; active_job_count: number;
};

type JobRow = {
  id: string; external_id: string; source_id: string; source_type: Job["source"]; source_name: string;
  title: string; company: string; location: string; work_mode: Job["workMode"]; description: string;
  apply_url: string; posted_at: string | null; skills: string; requirements: string; category: string;
  level: string; last_seen_at: string;
};

let database: Database.Database | null = null;

export function getJobDatabase() {
  if (database) return database;
  const file = process.env.CARRERFIT_DB_PATH || join(process.env.CARRERFIT_DATA_DIR || join(process.cwd(), "server", "data"), "carrerfit.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  database = new Database(file);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
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
  `);
  return database;
}

export function createJobSource(input: { name: string; url: string; type: SourceKind }) {
  const db = getJobDatabase();
  const id = randomUUID(); const now = new Date().toISOString();
  db.prepare("INSERT INTO job_sources (id,name,url,type,created_at) VALUES (?,?,?,?,?)").run(id, input.name, input.url, input.type, now);
  return getJobSource(id)!;
}

export function getJobSource(id: string) {
  const row = getJobDatabase().prepare(`SELECT s.*, (SELECT COUNT(*) FROM imported_jobs j WHERE j.source_id=s.id AND j.active=1) active_job_count FROM job_sources s WHERE s.id=?`).get(id) as SourceRow | undefined;
  return row ? mapSource(row) : null;
}

export function listJobSources() {
  return (getJobDatabase().prepare(`SELECT s.*, (SELECT COUNT(*) FROM imported_jobs j WHERE j.source_id=s.id AND j.active=1) active_job_count FROM job_sources s ORDER BY s.created_at DESC`).all() as SourceRow[]).map(mapSource);
}

export function setJobSourceEnabled(id: string, enabled: boolean) {
  getJobDatabase().prepare("UPDATE job_sources SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
  return getJobSource(id);
}

export function deleteJobSource(id: string) {
  return getJobDatabase().prepare("DELETE FROM job_sources WHERE id=?").run(id).changes > 0;
}

export function markSourceRunning(id: string) {
  getJobDatabase().prepare("UPDATE job_sources SET last_status='Running', last_error=NULL WHERE id=?").run(id);
}

export function markSourceFailed(id: string, message: string) {
  getJobDatabase().prepare("UPDATE job_sources SET last_status='Failed', last_error=?, last_scraped_at=? WHERE id=?").run(message.slice(0, 500), new Date().toISOString(), id);
}

export function replaceSourceJobs(source: JobSource, jobs: ImportedJob[]) {
  const db = getJobDatabase(); const now = new Date().toISOString();
  const upsert = db.prepare(`INSERT INTO imported_jobs
    (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,first_seen_at,last_seen_at,active)
    VALUES (@id,@externalId,@sourceId,@sourceType,@sourceName,@title,@company,@location,@workMode,@description,@applyUrl,@postedAt,@skills,@requirements,@category,@level,@now,@now,1)
    ON CONFLICT(source_id,external_id) DO UPDATE SET source_type=excluded.source_type,source_name=excluded.source_name,title=excluded.title,company=excluded.company,location=excluded.location,work_mode=excluded.work_mode,description=excluded.description,apply_url=excluded.apply_url,posted_at=excluded.posted_at,skills=excluded.skills,requirements=excluded.requirements,category=excluded.category,level=excluded.level,last_seen_at=excluded.last_seen_at,active=1`);
  const transaction = db.transaction(() => {
    db.prepare("UPDATE imported_jobs SET active=0 WHERE source_id=?").run(source.id);
    for (const job of jobs) upsert.run({
      ...job, id: `imported-${randomUUID()}`, sourceId: source.id,
      sourceType: source.type === "Structured data" ? "Company careers" : source.type,
      sourceName: source.name, skills: JSON.stringify(job.skills), requirements: JSON.stringify(job.requirements), now,
    });
    db.prepare("UPDATE job_sources SET last_status='Success',last_error=NULL,last_scraped_at=?,last_import_count=? WHERE id=?").run(now, jobs.length, source.id);
  });
  transaction();
}

export function listImportedJobs(options: { q?: string; category?: string; mode?: string; limit?: number } = {}) {
  const clauses = ["active=1"]; const values: unknown[] = [];
  if (options.q) { clauses.push("(lower(title) LIKE ? OR lower(company) LIKE ? OR lower(skills) LIKE ?)"); const q = `%${options.q.toLowerCase()}%`; values.push(q, q, q); }
  if (options.category && options.category !== "All") { clauses.push("category=?"); values.push(options.category); }
  if (options.mode && options.mode !== "All") { clauses.push("work_mode=?"); values.push(options.mode); }
  values.push(Math.min(options.limit || 500, 1000));
  const rows = getJobDatabase().prepare(`SELECT * FROM imported_jobs WHERE ${clauses.join(" AND ")} ORDER BY COALESCE(posted_at,last_seen_at) DESC LIMIT ?`).all(...values) as JobRow[];
  return rows.map(mapJob);
}

export function getImportedJob(id: string) {
  const row = getJobDatabase().prepare("SELECT * FROM imported_jobs WHERE id=? AND active=1").get(id) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function getJobSourceOverview(): JobSourceOverview {
  const sources = listJobSources();
  const stats = getJobDatabase().prepare(`SELECT COUNT(*) activeJobs, SUM(CASE WHEN datetime(first_seen_at) >= datetime('now','-1 day') THEN 1 ELSE 0 END) last24Hours FROM imported_jobs WHERE active=1`).get() as { activeJobs: number; last24Hours: number };
  return {
    sources,
    stats: { sources: sources.length, activeJobs: stats.activeJobs || 0, last24Hours: stats.last24Hours || 0, failedSources: sources.filter((source) => source.lastStatus === "Failed").length },
    recentJobs: listImportedJobs({ limit: 8 }),
  };
}

function mapSource(row: SourceRow): JobSource {
  return { id: row.id, name: row.name, url: row.url, type: row.type, enabled: Boolean(row.enabled), createdAt: row.created_at, lastScrapedAt: row.last_scraped_at, lastStatus: row.last_status, lastError: row.last_error, lastImportCount: row.last_import_count, activeJobCount: row.active_job_count || 0 };
}

function mapJob(row: JobRow): Job {
  const posted = row.posted_at ? new Date(row.posted_at) : new Date(row.last_seen_at);
  return {
    id: row.id, title: row.title, company: row.company, location: row.location, workMode: row.work_mode,
    salaryMin: 0, salaryMax: 0, category: row.category, level: row.level, description: row.description,
    skills: safeArray(row.skills), requirements: safeArray(row.requirements), fitScore: 72,
    postedDaysAgo: Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86_400_000)), logo: initials(row.company),
    applyUrl: row.apply_url, source: row.source_type, sourceName: row.source_name, verifiedAt: row.last_seen_at.slice(0, 10), imported: true,
  };
}

function safeArray(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "JOB"; }

export function closeJobDatabaseForTests() { database?.close(); database = null; }
