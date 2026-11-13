import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export class AuthenticationError extends Error {
  constructor() {
    super("You must sign in to continue.");
    this.name = "AuthenticationError";
  }
}

// Identity comes from the session, never from fields supplied by the browser.
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) throw new AuthenticationError();
  return session.user;
}
