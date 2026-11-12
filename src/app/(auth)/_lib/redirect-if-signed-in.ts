import "server-only";

import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/routes";
import { getSession } from "@/server/auth/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads `?redirect=` from the page's searchParams (first value if repeated). */
export async function readRedirectParam(searchParams: SearchParams): Promise<string | undefined> {
  const value = (await searchParams).redirect;
  return Array.isArray(value) ? value[0] : value;
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
