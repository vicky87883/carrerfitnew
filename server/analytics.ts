import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { databaseBackend, getMysqlPool } from "./mysql.js";
import { getSqliteJobDatabase } from "./job-database.js";

export type AnalyticsEvent = {
  sessionId: string;
  userId: string | null;
  path: string;
  type: "page_view" | "engagement" | "page_exit";
  durationMs: number;
  device: "Desktop" | "Mobile" | "Tablet" | "Unknown";
};

export async function recordAnalyticsEvent(event: AnalyticsEvent) {
  const now = new Date().toISOString(); const id = randomUUID();
  if (databaseBackend() === "mysql") {
    const pool = await getMysqlPool();
    await pool.execute(`INSERT INTO analytics_sessions
      (id,user_id,device_type,started_at,last_seen_at,total_duration_ms,page_views)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE user_id=COALESCE(VALUES(user_id),user_id),device_type=VALUES(device_type),
      last_seen_at=VALUES(last_seen_at),total_duration_ms=total_duration_ms+VALUES(total_duration_ms),
      page_views=page_views+VALUES(page_views)`,
      [event.sessionId, event.userId, event.device, mysqlDate(now), mysqlDate(now), event.durationMs, event.type === "page_view" ? 1 : 0]);
    await pool.execute("INSERT INTO analytics_events (id,session_id,user_id,path,event_type,duration_ms,created_at) VALUES (?,?,?,?,?,?,?)",
      [id, event.sessionId, event.userId, event.path, event.type, event.durationMs, mysqlDate(now)]);
  } else {
    const db = getSqliteJobDatabase(); ensureSqlite();
    db.prepare(`INSERT INTO analytics_sessions (id,user_id,device_type,started_at,last_seen_at,total_duration_ms,page_views)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET user_id=COALESCE(excluded.user_id,user_id),device_type=excluded.device_type,
      last_seen_at=excluded.last_seen_at,total_duration_ms=total_duration_ms+excluded.total_duration_ms,
      page_views=page_views+excluded.page_views`).run(event.sessionId, event.userId, event.device, now, now, event.durationMs, event.type === "page_view" ? 1 : 0);
    db.prepare("INSERT INTO analytics_events (id,session_id,user_id,path,event_type,duration_ms,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, event.sessionId, event.userId, event.path, event.type, event.durationMs, now);
  }
}

export async function getAdminAnalytics() {
  if (databaseBackend() === "mysql") {
    const pool = await getMysqlPool();
    const [[summary], [pages], [sessions], [users]] = await Promise.all([
      pool.query<(RowDataPacket & { sessions: number; pageViews: number; totalDuration: number; knownUsers: number })[]>(`SELECT COUNT(*) sessions,SUM(page_views) pageViews,SUM(total_duration_ms) totalDuration,COUNT(DISTINCT user_id) knownUsers FROM analytics_sessions WHERE last_seen_at>=UTC_TIMESTAMP(3)-INTERVAL 30 DAY`),
      pool.query<(RowDataPacket & { path: string; views: number; durationMs: number; visitors: number })[]>(`SELECT path,SUM(event_type='page_view') views,SUM(duration_ms) durationMs,COUNT(DISTINCT session_id) visitors FROM analytics_events WHERE created_at>=UTC_TIMESTAMP(3)-INTERVAL 30 DAY GROUP BY path ORDER BY views DESC,durationMs DESC LIMIT 30`),
      pool.query<(RowDataPacket & { id: string; name: string | null; email: string | null; device: string; pageViews: number; durationMs: number; startedAt: string; lastSeenAt: string })[]>(`SELECT s.id,u.name,u.email,s.device_type device,s.page_views pageViews,s.total_duration_ms durationMs,s.started_at startedAt,s.last_seen_at lastSeenAt FROM analytics_sessions s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.last_seen_at DESC LIMIT 50`),
      pool.query<(RowDataPacket & { id: string; name: string; email: string; sessions: number; pageViews: number; durationMs: number; lastSeenAt: string })[]>(`SELECT u.id,u.name,u.email,COUNT(DISTINCT s.id) sessions,SUM(s.page_views) pageViews,SUM(s.total_duration_ms) durationMs,MAX(s.last_seen_at) lastSeenAt FROM analytics_sessions s JOIN users u ON u.id=s.user_id GROUP BY u.id,u.name,u.email ORDER BY lastSeenAt DESC LIMIT 50`),
    ]);
    return normalizeAnalytics(summary[0], pages, sessions, users);
  }
  ensureSqlite(); const db = getSqliteJobDatabase();
  const summary = db.prepare(`SELECT COUNT(*) sessions,SUM(page_views) pageViews,SUM(total_duration_ms) totalDuration,COUNT(DISTINCT user_id) knownUsers FROM analytics_sessions WHERE datetime(last_seen_at)>=datetime('now','-30 days')`).get();
  const pages = db.prepare(`SELECT path,SUM(event_type='page_view') views,SUM(duration_ms) durationMs,COUNT(DISTINCT session_id) visitors FROM analytics_events WHERE datetime(created_at)>=datetime('now','-30 days') GROUP BY path ORDER BY views DESC,durationMs DESC LIMIT 30`).all();
  const sessions = db.prepare(`SELECT s.id,u.name,u.email,s.device_type device,s.page_views pageViews,s.total_duration_ms durationMs,s.started_at startedAt,s.last_seen_at lastSeenAt FROM analytics_sessions s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.last_seen_at DESC LIMIT 50`).all();
  const users = db.prepare(`SELECT u.id,u.name,u.email,COUNT(DISTINCT s.id) sessions,SUM(s.page_views) pageViews,SUM(s.total_duration_ms) durationMs,MAX(s.last_seen_at) lastSeenAt FROM analytics_sessions s JOIN users u ON u.id=s.user_id GROUP BY u.id,u.name,u.email ORDER BY lastSeenAt DESC LIMIT 50`).all();
  return normalizeAnalytics(summary, pages, sessions, users);
}

function normalizeAnalytics(summary: any, pages: any[], sessions: any[], users: any[]) {
  const totalSessions = Number(summary?.sessions || 0); const durationMs = Number(summary?.totalDuration || 0);
  return {
    rangeDays: 30,
    summary: { sessions: totalSessions, pageViews: Number(summary?.pageViews || 0), knownUsers: Number(summary?.knownUsers || 0), averageSessionSeconds: totalSessions ? Math.round(durationMs / totalSessions / 1000) : 0 },
    pages: pages.map((row) => ({ path: String(row.path), views: Number(row.views || 0), visitors: Number(row.visitors || 0), durationSeconds: Math.round(Number(row.durationMs || 0) / 1000) })),
    sessions: sessions.map((row) => ({ id: String(row.id), name: row.name ? String(row.name) : null, email: row.email ? String(row.email) : null, device: String(row.device || "Unknown"), pageViews: Number(row.pageViews || 0), durationSeconds: Math.round(Number(row.durationMs || 0) / 1000), startedAt: iso(String(row.startedAt)), lastSeenAt: iso(String(row.lastSeenAt)) })),
    users: users.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), sessions: Number(row.sessions || 0), pageViews: Number(row.pageViews || 0), durationSeconds: Math.round(Number(row.durationMs || 0) / 1000), lastSeenAt: iso(String(row.lastSeenAt)) })),
  };
}

export function analyticsDevice(userAgent: string | null): AnalyticsEvent["device"] {
  const value = userAgent || "";
  if (/ipad|tablet|kindle/i.test(value)) return "Tablet";
  if (/mobi|android|iphone/i.test(value)) return "Mobile";
  if (value) return "Desktop";
  return "Unknown";
}

function ensureSqlite() {
  getSqliteJobDatabase().exec(`
    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id TEXT PRIMARY KEY,user_id TEXT,device_type TEXT NOT NULL,started_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,
      total_duration_ms INTEGER NOT NULL DEFAULT 0,page_views INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,session_id TEXT NOT NULL,user_id TEXT,path TEXT NOT NULL,event_type TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analytics_events_path_idx ON analytics_events(path,created_at);
    CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events(session_id,created_at);
  `);
}
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
