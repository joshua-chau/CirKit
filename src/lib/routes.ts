// Route constants and redirect helpers shared by proxy.ts, server code and
// client components (e.g. the login form). Keep this file free of
// server-only imports so it can be used on both sides.

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

/** Query-string key used to send the user back to where they were. */
export const REDIRECT_PARAM = "redirect";

/** Pages that are reachable without being logged in. */
export const AUTH_ROUTES = [LOGIN_PATH, SIGNUP_PATH] as const;

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Returns a safe, same-site path to redirect to after login.
 *
 * Blocks open redirects such as `?redirect=https://evil.com` or
 * `?redirect=//evil.com`, and never sends the user back to /login or /signup
 * (which would loop). Falls back to the dashboard.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_LOGIN_REDIRECT;
  }

  try {
    const base = "http://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || isAuthRoute(url.pathname)) {
      return DEFAULT_LOGIN_REDIRECT;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_LOGIN_REDIRECT;
  }
}

/** Builds `/login?redirect=<path>` for a page the user tried to open. */
export function loginUrlFor(pathWithSearch: string): string {
  const params = new URLSearchParams({
    [REDIRECT_PARAM]: safeRedirectPath(pathWithSearch),
  });
  return `${LOGIN_PATH}?${params.toString()}`;
}
