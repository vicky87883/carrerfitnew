import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { databaseBackend, getMysqlPool } from "./mysql.js";
import { getSqliteJobDatabase } from "./job-database.js";

type ResumeRow = RowDataPacket & { filename: string; mime_type: string; size_bytes: number; encrypted_data: Buffer; iv: Buffer; auth_tag: Buffer; uploaded_at: string };

export async function saveResumeFile(userId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
  const key = vaultKey(); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(file.buffer), cipher.final()]); const tag = cipher.getAuthTag(); const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute(`INSERT INTO user_resume_files
    (user_id,filename,mime_type,size_bytes,encrypted_data,iv,auth_tag,uploaded_at) VALUES (?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE filename=VALUES(filename),mime_type=VALUES(mime_type),size_bytes=VALUES(size_bytes),encrypted_data=VALUES(encrypted_data),iv=VALUES(iv),auth_tag=VALUES(auth_tag),uploaded_at=VALUES(uploaded_at)`,
    [userId, safeFilename(file.originalname), file.mimetype, file.size, encrypted, iv, tag, mysqlDate(now)]);
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); db.prepare(`INSERT INTO user_resume_files
    (user_id,filename,mime_type,size_bytes,encrypted_data,iv,auth_tag,uploaded_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET filename=excluded.filename,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,encrypted_data=excluded.encrypted_data,iv=excluded.iv,auth_tag=excluded.auth_tag,uploaded_at=excluded.uploaded_at`).run(userId, safeFilename(file.originalname), file.mimetype, file.size, encrypted, iv, tag, now); }
}

export async function getResumeFile(userId: string) {
  let row: ResumeRow | undefined;
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<ResumeRow[]>("SELECT filename,mime_type,size_bytes,encrypted_data,iv,auth_tag,uploaded_at FROM user_resume_files WHERE user_id=? LIMIT 1", [userId]); row = rows[0]; }
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); row = db.prepare("SELECT filename,mime_type,size_bytes,encrypted_data,iv,auth_tag,uploaded_at FROM user_resume_files WHERE user_id=? LIMIT 1").get(userId) as ResumeRow | undefined; }
  if (!row) return null;
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(row.iv)); decipher.setAuthTag(Buffer.from(row.auth_tag));
  const data = Buffer.concat([decipher.update(Buffer.from(row.encrypted_data)), decipher.final()]);
  return { filename: row.filename, mimeType: row.mime_type, size: Number(row.size_bytes), uploadedAt: iso(row.uploaded_at), data };
}

function vaultKey() { const secret = process.env.AUTH_SECRET || ""; if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for encrypted resume storage."); return createHash("sha256").update(`carrerfit-resume-vault:${secret}`).digest(); }
function safeFilename(value: string) { return value.replace(/[\r\n"\\/]/g, "_").slice(0, 255) || "resume"; }
function ensureSqlite(db: ReturnType<typeof getSqliteJobDatabase>) { db.exec(`CREATE TABLE IF NOT EXISTS user_resume_files (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,encrypted_data BLOB NOT NULL,iv BLOB NOT NULL,auth_tag BLOB NOT NULL,uploaded_at TEXT NOT NULL)`); }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
