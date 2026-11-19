import "server-only";

import { AuthenticationError } from "@/lib/require-user";
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

// JSON responses for the group/invitation API routes, in the same shape as
// the item and request APIs: { data } on success, { error: { code, message } }.

const noStore = { "Cache-Control": "private, no-store" };

export function jsonData(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: noStore });
}

export function jsonError(error: unknown): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof AuthenticationError) {
    [status, code, message] = [401, "UNAUTHENTICATED", error.message];
  } else if (error instanceof DomainError) {
    message = error.message;
    if (error instanceof NotFoundError) [status, code] = [404, "NOT_FOUND"];
    else if (error instanceof ForbiddenError) [status, code] = [403, "FORBIDDEN"];
    else if (error instanceof ConflictError) [status, code] = [409, "CONFLICT"];
    else if (error instanceof ValidationError) [status, code] = [400, "INVALID_INPUT"];
    else [status, code] = [400, "BAD_REQUEST"];
  } else {
    console.error("Unexpected API error:", error);
  }

  return Response.json({ error: { code, message } }, { status, headers: noStore });
}
