import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { AtsAnalysis, ResumeDocument } from "../lib/types.js";
import { databaseBackend, getMysqlPool } from "./mysql.js";
import { getSqliteJobDatabase } from "./job-database.js";

type ResumeRow = RowDataPacket & { filename: string; mime_type: string; size_bytes: number; encrypted_data: Buffer; iv: Buffer; auth_tag: Buffer; uploaded_at: string };
type DocumentRow = RowDataPacket & { encrypted_document: Buffer; document_iv: Buffer; document_auth_tag: Buffer; encrypted_text: Buffer; text_iv: Buffer; text_auth_tag: Buffer; word_count: number; character_count: number; analyzed_at: string };

export async function createResumeAnalysisRun(userId: string, filename: string) {
  const run = { id: randomUUID(), createdAt: new Date().toISOString() };
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO resume_analysis_runs (id,user_id,filename,status,created_at) VALUES (?,?,?,'Processing',?)", [run.id, userId, safeFilename(filename), mysqlDate(run.createdAt)]);
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); db.prepare("INSERT INTO resume_analysis_runs (id,user_id,filename,status,created_at) VALUES (?,?,?,'Processing',?)").run(run.id, userId, safeFilename(filename), run.createdAt); }
  return run;
}
export async function completeResumeAnalysisRun(id: string, result: { aiPowered: boolean; atsScore: number; extractionConfidence: number; processingMs: number }) {
  const completedAt = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE resume_analysis_runs SET status='Completed',ai_powered=?,ats_score=?,extraction_confidence=?,processing_ms=?,completed_at=? WHERE id=?", [result.aiPowered ? 1 : 0, result.atsScore, result.extractionConfidence, result.processingMs, mysqlDate(completedAt), id]);
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); db.prepare("UPDATE resume_analysis_runs SET status='Completed',ai_powered=?,ats_score=?,extraction_confidence=?,processing_ms=?,completed_at=? WHERE id=?").run(result.aiPowered ? 1 : 0, result.atsScore, result.extractionConfidence, result.processingMs, completedAt, id); }
}
export async function failResumeAnalysisRun(id: string, errorCode: string, processingMs: number) {
  const completedAt = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE resume_analysis_runs SET status='Failed',error_code=?,processing_ms=?,completed_at=? WHERE id=?", [errorCode.slice(0, 80), processingMs, mysqlDate(completedAt), id]);
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); db.prepare("UPDATE resume_analysis_runs SET status='Failed',error_code=?,processing_ms=?,completed_at=? WHERE id=?").run(errorCode.slice(0, 80), processingMs, completedAt, id); }
}

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

export async function saveResumeDocument(userId: string, extractedText: string, document: ResumeDocument, ats?: AtsAnalysis) {
  const documentPayload = encrypt(Buffer.from(JSON.stringify({ document, ats: ats || null }), "utf8"));
  const textPayload = encrypt(Buffer.from(extractedText, "utf8")); const now = new Date().toISOString();
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute(`INSERT INTO user_resume_documents
    (user_id,encrypted_document,document_iv,document_auth_tag,encrypted_text,text_iv,text_auth_tag,word_count,character_count,analyzed_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE encrypted_document=VALUES(encrypted_document),document_iv=VALUES(document_iv),document_auth_tag=VALUES(document_auth_tag),encrypted_text=VALUES(encrypted_text),text_iv=VALUES(text_iv),text_auth_tag=VALUES(text_auth_tag),word_count=VALUES(word_count),character_count=VALUES(character_count),analyzed_at=VALUES(analyzed_at)`,
    [userId, documentPayload.data, documentPayload.iv, documentPayload.tag, textPayload.data, textPayload.iv, textPayload.tag, document.wordCount, document.characterCount, mysqlDate(now)]);
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); db.prepare(`INSERT INTO user_resume_documents
    (user_id,encrypted_document,document_iv,document_auth_tag,encrypted_text,text_iv,text_auth_tag,word_count,character_count,analyzed_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET encrypted_document=excluded.encrypted_document,document_iv=excluded.document_iv,document_auth_tag=excluded.document_auth_tag,encrypted_text=excluded.encrypted_text,text_iv=excluded.text_iv,text_auth_tag=excluded.text_auth_tag,word_count=excluded.word_count,character_count=excluded.character_count,analyzed_at=excluded.analyzed_at`).run(userId, documentPayload.data, documentPayload.iv, documentPayload.tag, textPayload.data, textPayload.iv, textPayload.tag, document.wordCount, document.characterCount, now); }
}

export async function getResumeDocument(userId: string) {
  let row: DocumentRow | undefined;
  const query = "SELECT encrypted_document,document_iv,document_auth_tag,encrypted_text,text_iv,text_auth_tag,word_count,character_count,analyzed_at FROM user_resume_documents WHERE user_id=? LIMIT 1";
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<DocumentRow[]>(query, [userId]); row = rows[0]; }
  else { const db = getSqliteJobDatabase(); ensureSqlite(db); row = db.prepare(query).get(userId) as DocumentRow | undefined; }
  if (!row) return null;
  const parsed = JSON.parse(decrypt(row.encrypted_document, row.document_iv, row.document_auth_tag).toString("utf8")) as ResumeDocument | { document: ResumeDocument; ats?: AtsAnalysis | null };
  const document = "document" in parsed ? parsed.document : parsed;
  return { document, ats: "document" in parsed ? parsed.ats || null : null, wordCount: Number(row.word_count), characterCount: Number(row.character_count), analyzedAt: iso(row.analyzed_at) };
}

function vaultKey() { const secret = process.env.AUTH_SECRET || ""; if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for encrypted resume storage."); return createHash("sha256").update(`carrerfit-resume-vault:${secret}`).digest(); }
function encrypt(value: Buffer) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv); const data = Buffer.concat([cipher.update(value), cipher.final()]); return { data, iv, tag: cipher.getAuthTag() }; }
function decrypt(data: Buffer, iv: Buffer, tag: Buffer) { const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv)); decipher.setAuthTag(Buffer.from(tag)); return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]); }
function safeFilename(value: string) { return value.replace(/[\r\n"\\/]/g, "_").slice(0, 255) || "resume"; }
function ensureSqlite(db: ReturnType<typeof getSqliteJobDatabase>) { db.exec(`
  CREATE TABLE IF NOT EXISTS user_resume_files (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,encrypted_data BLOB NOT NULL,iv BLOB NOT NULL,auth_tag BLOB NOT NULL,uploaded_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_resume_documents (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,encrypted_document BLOB NOT NULL,document_iv BLOB NOT NULL,document_auth_tag BLOB NOT NULL,encrypted_text BLOB NOT NULL,text_iv BLOB NOT NULL,text_auth_tag BLOB NOT NULL,word_count INTEGER NOT NULL,character_count INTEGER NOT NULL,analyzed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS resume_analysis_runs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,filename TEXT NOT NULL,status TEXT NOT NULL,ai_powered INTEGER,ats_score INTEGER,extraction_confidence REAL,processing_ms INTEGER,error_code TEXT,created_at TEXT NOT NULL,completed_at TEXT);
  CREATE INDEX IF NOT EXISTS resume_runs_user_idx ON resume_analysis_runs(user_id,created_at);
`); }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
