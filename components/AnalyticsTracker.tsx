"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const heartbeatMs = 15_000;

export default function AnalyticsTracker() {
  const pathname = usePathname(); const currentPath = useRef(pathname); const lastActive = useRef(Date.now());

  useEffect(() => {
    currentPath.current = pathname; lastActive.current = Date.now();
    send("page_view", pathname, 0);
  }, [pathname]);

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now(); const duration = Math.min(heartbeatMs, Math.max(0, now - lastActive.current));
      lastActive.current = now; if (duration >= 1000) send("engagement", currentPath.current, duration);
    }, heartbeatMs);
    const visibility = () => {
      if (document.visibilityState === "visible") lastActive.current = Date.now();
      else flush("engagement");
    };
    const exit = () => flush("page_exit");
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", exit);
    return () => { window.clearInterval(heartbeat); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", exit); flush("page_exit"); };
  }, []);

  function flush(type: "engagement" | "page_exit") {
    const now = Date.now(); const duration = Math.min(heartbeatMs, Math.max(0, now - lastActive.current));
    lastActive.current = now; if (duration >= 1000) send(type, currentPath.current, duration, true);
  }
  return null;
}

function send(type: "page_view" | "engagement" | "page_exit", path: string, durationMs: number, beacon = false) {
  if (path.startsWith("/admin") || path.startsWith("/api/")) return;
  const sessionId = analyticsSessionId(); const payload = JSON.stringify({ sessionId, path, type, durationMs });
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon("/api/analytics/event", new Blob([payload], { type: "application/json" })); return; }
  void fetch("/api/analytics/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => undefined);
}
function analyticsSessionId() {
  const key = "carrerfit_analytics_session"; let value = sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
  return value;
}
