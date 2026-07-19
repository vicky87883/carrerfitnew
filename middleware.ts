import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/resume", "/interview", "/assessment", "/jobs", "/job-sources"];
const privatePaths = ["/admin", "/dashboard", "/resume", "/interview", "/assessment", "/jobs", "/job-sources", "/blog-admin", "/login", "/register", "/forgot-password", "/reset-password"];
const sensitiveQueryKeys = new Set(["password", "pass", "username", "email", "secret", "apikey", "api_key"]);

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://images.unsplash.com",
    "font-src 'self' data:", `connect-src 'self'${isDev ? " ws: wss:" : ""}`, "media-src 'self' blob:", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const canonicalUrl = request.nextUrl.clone(); let canonicalStatus: 303 | 308 | null = null;
  if (canonicalUrl.hostname === "www.carrerfit.com") { canonicalUrl.hostname = "carrerfit.com"; canonicalStatus = 308; }
  for (const key of [...canonicalUrl.searchParams.keys()]) if (sensitiveQueryKeys.has(key.toLowerCase())) { canonicalUrl.searchParams.delete(key); canonicalStatus = 303; }
  if (canonicalStatus) {
    const response = NextResponse.redirect(canonicalUrl, canonicalStatus); secureHeaders(response, policy, true); return response;
  }
  if (process.env.NODE_ENV === "production" && ["/job-sources", "/blog-admin"].includes(request.nextUrl.pathname)) {
    const response = NextResponse.redirect(new URL("/admin", request.url), 308); secureHeaders(response, policy, true); return response;
  }
  const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce); requestHeaders.set("Content-Security-Policy", policy);
  const needsLogin = /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED || "")
    && protectedPaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))
    && !request.cookies.has("carrerfit_session");
  if (needsLogin) {
    const login = new URL("/login", request.url); login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(login); secureHeaders(response, policy, true); return response;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  secureHeaders(response, policy, privatePaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))); return response;
}

function secureHeaders(response: NextResponse, policy: string, privatePage: boolean) {
  response.headers.set("Content-Security-Policy", policy);
  if (privatePage) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
