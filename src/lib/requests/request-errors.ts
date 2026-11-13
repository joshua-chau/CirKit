/**
 * Classifies expected input, permission, and request workflow errors.
 * Controllers map these codes to HTTP response statuses.
 */
export type RequestErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT";

/**
 * Describes an expected failure with a category and a specific reason.
 * Authentication and unexpected system errors are handled separately.
 */
export class RequestError extends Error {
  // Stable category used by controllers to handle the error.
  readonly code: RequestErrorCode;

  constructor(code: RequestErrorCode, message: string) {
    super(message);

    // Identifies errors created by this class.
    this.name = "RequestError";

    this.code = code;
  }
}
