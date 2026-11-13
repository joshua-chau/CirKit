import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/routes";

/**
 * The real authentication check. Validates the session cookie against the
 * database through Better Auth.
 *
 * Wrapped in React `cache()` so calling it from a layout, a page and several
 * components in the same request only hits the database once.
 *
 * Note: this reads request headers, so with `cacheComponents: true` any
 * component that calls it must render inside a <Suspense> boundary.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type AuthUser = AuthSession["user"];

/** Returns the logged-in user, or null. Use when a page works either way. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Returns the logged-in user, or redirects to /login.
 *
 * Call this at the top of EVERY protected page, Server Action and route
 * handler. proxy.ts only checks that a cookie exists; this is the check that
 * actually enforces authentication.
 */
export async function requireUser(): Promise<AuthUser> {
  const session = await getSession();
  if (!session) {
    redirect(LOGIN_PATH);
  }
  return session.user;
}
