import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool, isMysqlConfigured } from "../server/mysql.js";

type Source = { id: string; name: string; url: string; type: string; enabled: number; created_at: string; last_scraped_at: string | null; last_status: string; last_error: string | null; last_import_count: number };
type Job = Record<string, string | number | null> & { source_id: string };

async function main() {
  if (!isMysqlConfigured()) throw new Error("Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD before migrating.");
  const sqlitePath = process.env.SQLITE_SOURCE_PATH || process.env.CARRERFIT_DB_PATH || join(process.cwd(), "server", "data", "carrerfit.sqlite");
  const sqlite = new Database(sqlitePath, { readonly: true });
  const sources = sqlite.prepare("SELECT * FROM job_sources ORDER BY created_at").all() as Source[];
  const jobs = sqlite.prepare("SELECT * FROM imported_jobs ORDER BY first_seen_at").all() as Job[];
  const pool = await getMysqlPool(); const connection = await pool.getConnection(); const sourceIds = new Map<string, string>();
  try {
    await connection.beginTransaction();
    for (const source of sources) {
      const hash = createHash("sha256").update(source.url).digest("hex");
      const [existing] = await connection.execute<(RowDataPacket & { id: string })[]>("SELECT id FROM job_sources WHERE url_hash=? LIMIT 1", [hash]);
      const targetId = existing[0]?.id || source.id; sourceIds.set(source.id, targetId);
      if (!existing[0]) await connection.execute(
        `INSERT INTO job_sources (id,name,url,url_hash,type,enabled,created_at,last_scraped_at,last_status,last_error,last_import_count)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [targetId, source.name, source.url, hash, source.type, source.enabled, mysqlDate(source.created_at), nullableDate(source.last_scraped_at), source.last_status, source.last_error, source.last_import_count],
      );
    }
    for (const job of jobs) {
      await connection.execute(
        `INSERT INTO imported_jobs (id,external_id,source_id,source_type,source_name,title,company,location,work_mode,description,apply_url,posted_at,skills,requirements,category,level,active,first_seen_at,last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE source_type=VALUES(source_type),source_name=VALUES(source_name),title=VALUES(title),company=VALUES(company),location=VALUES(location),work_mode=VALUES(work_mode),description=VALUES(description),apply_url=VALUES(apply_url),posted_at=VALUES(posted_at),skills=VALUES(skills),requirements=VALUES(requirements),category=VALUES(category),level=VALUES(level),active=VALUES(active),last_seen_at=VALUES(last_seen_at)`,
        [job.id, job.external_id, sourceIds.get(job.source_id) || job.source_id, job.source_type, job.source_name, job.title, job.company, job.location, job.work_mode, job.description, job.apply_url, nullableDate(job.posted_at as string | null), job.skills, job.requirements, job.category, job.level, job.active, mysqlDate(String(job.first_seen_at)), mysqlDate(String(job.last_seen_at))],
      );
    }
    try {
      const storePath = process.env.SQLITE_STORE_PATH || join(process.env.CARRERFIT_DATA_DIR || join(process.cwd(), "server", "data"), "store.json");
      const payload = await readFile(storePath, "utf8"); JSON.parse(payload);
      await connection.execute("INSERT INTO carrerfit_store (store_key,payload,updated_at) VALUES ('career',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=VALUES(updated_at)", [payload]);
    } catch (error) {
      if (!(error instanceof SyntaxError) && (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")) throw error;
    }
    await connection.commit();
    console.log(`Migration complete: ${sources.length} sources and ${jobs.length} jobs copied to MySQL without deleting SQLite data.`);
  } catch (error) {
    await connection.rollback(); throw error;
  } finally {
    connection.release(); sqlite.close(); await pool.end();
  }
}

function nullableDate(value: string | null) { return value ? mysqlDate(value) : null; }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
