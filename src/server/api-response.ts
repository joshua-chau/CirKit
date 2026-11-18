import "server-only";

import { ImageValidationError } from "@/lib/image-validation";
import { AuthenticationError } from "@/lib/require-user";
import { StorageError } from "@/lib/storage";
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
  } else if (error instanceof ImageValidationError) {
    status = error.code === "IMAGE_TOO_LARGE" ? 413 : 400;
    [code, message] = [error.code, error.message];
  } else if (error instanceof StorageError) {
    if (error.code === "NOT_FOUND") [status, code, message] = [404, "NOT_FOUND", "The image was not found."];
    else if (error.code === "INVALID_INPUT") [status, code, message] = [400, "INVALID_INPUT", error.message];
    else {
      console.error("Image storage is not configured:", error.message);
      [status, code, message] = [503, "NOT_CONFIGURED", "Image storage is unavailable."];
    }
  } else {
    console.error("Unexpected API error:", error);
  }

  return Response.json({ error: { code, message } }, { status, headers: noStore });
}
