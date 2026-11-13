/**
 * Shared authentication helper for the planned request CRUD architecture.
 *
 * Architecture assumptions:
 * - Next.js App Router route.ts files act as Controllers.
 * - Each protected Controller calls requireUser() before invoking a Service.
 * - Controllers pass the returned user.id to the Service as the acting user.
 * - Services check group membership, item access, ownership, and request state.
 * - Services use Prisma to read or update PostgreSQL records.
 *
 * Planned CRUD operations:
 * - Create: POST /api/requests creates a PENDING request.
 * - Read: GET /api/requests/my-request lists the current user's requests.
 * - Read: GET /api/items/[itemId]/requests lists requests for the item Owner.
 * - Update: POST /api/requests/[requestId]/approve, decline, cancel, or return.
 * - Request history is retained; cancellation is an update, not a DELETE.
 * The business Controllers call the implemented request Service functions.
 *
 * Authentication assumptions:
 * - The browser sends the existing Better Auth session cookie with the request.
 * - This helper runs within an active Next.js server request context.
 * - Better Auth identifies the user; a client-supplied borrowerId is not trusted.
 * - Controllers return HTTP 401 for AuthenticationError and handle unexpected
 *   system errors separately. This helper does not create HTTP responses.
 */
import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Indicates that the current request has no valid authenticated session.
 * Controllers handle this error by returning HTTP 401.
 */
export class AuthenticationError extends Error {
  constructor() {
    super("You must sign in to continue.");

    this.name = "AuthenticationError";
  }
}

/**
 * Returns the user associated with the current authenticated session.
 * Group membership and resource permissions must be checked separately.
 */
export async function requireUser() {
  // Read the current request headers, including its session cookie.
  const requestHeaders = await headers();

  // Let Better Auth validate the session and identify the user.
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  // Reject requests without a valid authenticated session.
  if (session === null) {
    throw new AuthenticationError();
  }

  const user = session.user;

  return user;
}
