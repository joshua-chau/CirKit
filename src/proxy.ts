import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isAuthRoute, loginUrlFor } from "@/lib/routes";

/**
 * Optimistic route guard (Next.js 16 "proxy", formerly middleware).
 *
 * Only checks whether a session cookie EXISTS — it does not hit the database,
 * so an expired or forged cookie will get past it. The real check is
 * `requireUser()` in src/server/auth/session.ts, which every protected page and
 * Server Action must call.
 *
 * Protected by default: every page except /login and /signup requires a
 * cookie, so new pages added by teammates are covered automatically.
 *
 * We intentionally do NOT redirect logged-in users away from /login here: a
 * stale cookie would bounce them /login -> /dashboard -> /login forever. The
 * login page does that redirect itself after a real getSession() check.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL(loginUrlFor(`${pathname}${search}`), request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes (they return JSON and check auth themselves), Next.js
  // internals, and static files such as /favicon.ico or /images/logo.png.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
