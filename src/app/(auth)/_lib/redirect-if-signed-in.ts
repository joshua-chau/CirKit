import "server-only";

import { redirect } from "next/navigation";

import { REDIRECT_PARAM, safeRedirectPath } from "@/lib/routes";
import { getSession } from "@/server/auth/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads `?redirect=` (where to go after login) and `?error=` (set by Better
 * Auth when a GitHub/Google login fails) from the page's searchParams.
 */
export async function readAuthParams(searchParams: SearchParams) {
  const params = await searchParams;
  return {
    redirectTo: first(params[REDIRECT_PARAM]),
    oauthError: first(params.error),
  };
}

/**
 * Sends an already-logged-in user on to where they were going. Uses a real
 * database session check, so a stale cookie does not cause a redirect loop
 * with proxy.ts.
 */
export async function redirectIfSignedIn(redirectTo: string | undefined): Promise<void> {
  const session = await getSession();
  if (session) {
    redirect(safeRedirectPath(redirectTo));
  }
}
