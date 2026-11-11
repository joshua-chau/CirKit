import { RequestError } from "@/lib/requests/request-errors";
import type {
  ValidatedCreateRequestInput,
} from "@/lib/requests/request-types";

/**
 * Validation helper for the planned Create Request Controller.
 *
 * Expected flow:
 * 1. The Controller authenticates the user with requireUser().
 * 2. The Controller parses the JSON body and passes it here as unknown.
 * 3. This function validates and converts the four allowed input fields.
 * 4. The Controller passes the result and authenticated user ID to the Service.
 *
 * Malformed JSON is handled by the Controller.
 * Resource existence, permissions, and item availability are checked by the Service.
 */

/**
 * Reads a required string and removes surrounding whitespace.
 */
function readRequiredString(
  input: Record<string, unknown>,
  fieldName: string,
): string {
  const value = input[fieldName];

  if (typeof value !== "string") {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " must be a string.",
    );
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " is required.",
    );
  }

  return trimmedValue;
}

/**
 * Converts a real calendar date into a Date object at UTC midnight.
 * Rejects invalid dates instead of allowing JavaScript to normalize them.
 */
function parseRequestDate(
  value: string,
  fieldName: string,
): Date {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const matchesFormat = datePattern.test(value);

  if (!matchesFormat) {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " must use YYYY-MM-DD format.",
    );
  }

  // PostgreSQL calendar dates do not have a year zero.
  const year = value.slice(0, 4);

  if (year === "0000") {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " must contain a valid year.",
    );
  }

  const dateText = value + "T00:00:00.000Z";
  const parsedDate = new Date(dateText);
  const timestamp = parsedDate.getTime();
  const isInvalidDate = Number.isNaN(timestamp);

  if (isInvalidDate) {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " must be a valid calendar date.",
    );
  }

  // For example, February 30 must not silently become a date in March.
  const serializedDate = parsedDate.toISOString();
  const normalizedDate = serializedDate.slice(0, 10);

  if (normalizedDate !== value) {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " must be a valid calendar date.",
    );
  }

  return parsedDate;
}

/**
 * Validates the request body and returns data suitable for the Service.
 * Client-supplied identities or statuses are not included in the result.
 */
export function validateCreateRequestInput(
  input: unknown,
): ValidatedCreateRequestInput {
  if (input === null || typeof input !== "object") {
    throw new RequestError(
      "INVALID_INPUT",
      "The request body must be a JSON object.",
    );
  }

  if (Array.isArray(input)) {
    throw new RequestError(
      "INVALID_INPUT",
      "The request body must be a JSON object.",
    );
  }

  const fields = input as Record<string, unknown>;

  const itemId = readRequiredString(fields, "itemId");
  const groupId = readRequiredString(fields, "groupId");
  const startDateText = readRequiredString(fields, "requestStartDate");
  const endDateText = readRequiredString(fields, "requestEndDate");

  const requestStartDate = parseRequestDate(
    startDateText,
    "requestStartDate",
  );
  const requestEndDate = parseRequestDate(
    endDateText,
    "requestEndDate",
  );

  const startTimestamp = requestStartDate.getTime();
  const endTimestamp = requestEndDate.getTime();

  if (endTimestamp < startTimestamp) {
    throw new RequestError(
      "INVALID_INPUT",
      "requestEndDate must be on or after requestStartDate.",
    );
  }

  const validatedInput: ValidatedCreateRequestInput = {
    itemId: itemId,
    groupId: groupId,
    requestStartDate: requestStartDate,
    requestEndDate: requestEndDate,
  };

  return validatedInput;
}
