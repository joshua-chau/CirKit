import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isAuthRoute, LOGIN_RETURN_PATH_HEADER, loginUrlFor } from "@/lib/routes";

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

  const preserveReturnPath = pathname === "/borrowing-items" || pathname === "/lending-items";
  if (!preserveReturnPath && !request.headers.has(LOGIN_RETURN_PATH_HEADER)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  // Keep the redirect destination tied to the URL even when a stale cookie reaches the page.
  requestHeaders.delete(LOGIN_RETURN_PATH_HEADER);
  if (preserveReturnPath) {
    const returnUrl = request.nextUrl.clone();
    returnUrl.searchParams.delete("_rsc");
    requestHeaders.set(LOGIN_RETURN_PATH_HEADER, `${returnUrl.pathname}${returnUrl.search}`);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip API routes (they return JSON and check auth themselves), Next.js
  // internals, and static files such as /favicon.ico or /images/logo.png.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
