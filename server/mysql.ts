import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

export function isMysqlConfigured() {
  if (process.env.DATABASE_URL?.startsWith("mysql")) return true;
  return ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].every((name) => Boolean(process.env[name]));
}

export function databaseBackend() {
  return isMysqlConfigured() ? "mysql" as const : "sqlite" as const;
}

export async function getMysqlPool() {
  if (!isMysqlConfigured()) throw new Error("MySQL environment variables are incomplete.");
  if (!pool) pool = mysql.createPool(mysqlOptions());
  await ensureMysqlSchema(pool);
  return pool;
}

export async function checkMysqlConnection() {
  const startedAt = Date.now();
  const connection = await (await getMysqlPool()).getConnection();
  try {
    await connection.query("SELECT 1");
    return { ok: true, backend: "mysql" as const, latencyMs: Date.now() - startedAt };
  } finally {
    connection.release();
  }
}

function mysqlOptions(): PoolOptions {
  const url = process.env.DATABASE_URL?.startsWith("mysql") ? new URL(process.env.DATABASE_URL) : null;
  const sslEnabled = /^(1|true|yes)$/i.test(process.env.DB_SSL || "");
  return {
    host: url?.hostname || process.env.DB_HOST,
    port: Number(url?.port || process.env.DB_PORT || 3306),
    user: url ? decodeURIComponent(url.username) : process.env.DB_USER,
    password: url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD,
    database: url ? decodeURIComponent(url.pathname.replace(/^\//, "")) : process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Math.max(2, Math.min(10, Number(process.env.DB_POOL_SIZE) || 5)),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    dateStrings: true,
    charset: "utf8mb4",
    ...(sslEnabled ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
  };
}

async function ensureMysqlSchema(target: Pool) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const connection = await target.getConnection();
    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS job_sources (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        url TEXT NOT NULL,
        url_hash CHAR(64) NOT NULL UNIQUE,
        type VARCHAR(40) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        last_scraped_at DATETIME(3) NULL,
        last_status VARCHAR(24) NOT NULL DEFAULT 'Pending',
        last_error VARCHAR(500) NULL,
        last_import_count INT UNSIGNED NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await connection.query(`CREATE TABLE IF NOT EXISTS imported_jobs (
        id VARCHAR(80) PRIMARY KEY,
        external_id VARCHAR(200) NOT NULL,
        source_id VARCHAR(36) NOT NULL,
        source_type VARCHAR(40) NOT NULL,
        source_name VARCHAR(120) NOT NULL,
        title VARCHAR(180) NOT NULL,
        company VARCHAR(120) NOT NULL,
        location VARCHAR(200) NOT NULL,
        work_mode VARCHAR(24) NOT NULL,
        description LONGTEXT NOT NULL,
        apply_url TEXT NOT NULL,
        posted_at DATETIME(3) NULL,
        skills LONGTEXT NOT NULL,
        requirements LONGTEXT NOT NULL,
        category VARCHAR(80) NOT NULL,
        level VARCHAR(80) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        first_seen_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        UNIQUE KEY imported_jobs_source_external_uq (source_id, external_id),
        KEY imported_jobs_active_idx (active, last_seen_at),
        KEY imported_jobs_search_idx (title, company, category),
        CONSTRAINT imported_jobs_source_fk FOREIGN KEY (source_id) REFERENCES job_sources(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await connection.query(`CREATE TABLE IF NOT EXISTS carrerfit_store (
        store_key VARCHAR(40) PRIMARY KEY,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    } finally {
      connection.release();
    }
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function closeMysqlPoolForTests() {
  if (pool) await pool.end();
  pool = null;
  schemaPromise = null;
}
