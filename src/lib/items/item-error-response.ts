import "server-only";

import { AuthenticationError } from "@/lib/require-user";
import { ItemValidationError } from "@/lib/items/item-validation";
import { ItemError } from "@/lib/items/item-errors";

export function createItemErrorResponse(error: unknown): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof AuthenticationError) {
    status = 401;
    code = "UNAUTHENTICATED";
    message = error.message;
  } else if (error instanceof ItemValidationError) {
    status = 400;
    code = "INVALID_INPUT";
    message = error.message;
  } else if (error instanceof ItemError) {
    status = { NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409 }[error.code];
    code = error.code;
    message = error.message;
  } else {
    console.error("Unexpected item API error:", error);
  }

  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
