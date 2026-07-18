import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/resume", "/interview", "/assessment", "/jobs", "/job-sources", "/admin"];

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
  const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce); requestHeaders.set("Content-Security-Policy", policy);
  const needsLogin = /^(1|true|yes)$/i.test(process.env.AUTH_REQUIRED || "")
    && protectedPaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))
    && !request.cookies.has("carrerfit_session");
  if (needsLogin) {
    const login = new URL("/login", request.url); login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(login); response.headers.set("Content-Security-Policy", policy); return response;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } }); response.headers.set("Content-Security-Policy", policy); return response;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
