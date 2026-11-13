import "server-only";

import {
  AuthenticationError,
} from "@/lib/require-user";
import {
  RequestError,
} from "@/lib/requests/request-errors";

/**
 * Converts errors caught by request Controllers into JSON HTTP responses.
 *
 * Controllers must convert malformed JSON into an INVALID_INPUT RequestError
 * at the JSON parsing step. Other unexpected errors remain system errors.
 *
 * Expected errors retain their specific messages.
 * Unexpected errors are logged server-side without exposing technical details.
 */
export function createRequestErrorResponse(
  error: unknown,
): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof AuthenticationError) {
    status = 401;
    code = "UNAUTHENTICATED";
    message = error.message;
  } else if (error instanceof RequestError) {
    code = error.code;
    message = error.message;

    if (error.code === "INVALID_INPUT") {
      status = 400;
    } else if (error.code === "FORBIDDEN") {
      status = 403;
    } else if (error.code === "NOT_FOUND") {
      status = 404;
    } else if (error.code === "CONFLICT") {
      status = 409;
    }
  } else {
    console.error("Unexpected request API error:", error);
  }

  const body = {
    error: {
      code: code,
      message: message,
    },
  };

  const response = Response.json(body, {
    status: status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

  return response;
}
