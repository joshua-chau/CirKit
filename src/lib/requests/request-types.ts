import type { RequestStatus } from "@/generated/prisma/enums";

/**
 * Defines the fields submitted by the request form.
 * Runtime validation is required before processing this input.
 */
export interface CreateRequestInput {
  // Identifier of the requested item.
  itemId: string;

  // Identifier of the group through which the request is submitted.
  groupId: string;

  // First borrowing day, formatted as YYYY-MM-DD.
  requestStartDate: string;

  // Last borrowing day, formatted as YYYY-MM-DD.
  requestEndDate: string;
}

/**
 * Defines the input returned by successful runtime validation.
 * Calendar dates are converted to Date objects at UTC midnight.
 */
export interface ValidatedCreateRequestInput {
  // Validated identifier of the requested item.
  itemId: string;

  // Validated identifier of the source group.
  groupId: string;

  // Validated first borrowing day.
  requestStartDate: Date;

  // Validated last borrowing day.
  requestEndDate: Date;
}

/**
 * Defines the request record returned by the API.
 * Dates and timestamps are serialized as strings for the browser.
 */
export interface RequestResponse {
  // Unique identifier of the request.
  requestId: string;

  // Identifier of the requested item.
  itemId: string;

  // Identifier of the user who submitted the request.
  borrowerId: string;

  // Identifier of the group where the request originated.
  groupId: string;

  // First borrowing day, formatted as YYYY-MM-DD.
  requestStartDate: string;

  // Last borrowing day, formatted as YYYY-MM-DD.
  requestEndDate: string;

  // Request status defined by the Prisma schema.
  requestStatus: RequestStatus;

  // Creation timestamp, formatted as an ISO 8601 string.
  requestCreatedAt: string;

  // Last update timestamp, formatted as an ISO 8601 string.
  requestUpdatedAt: string;

  // Completion timestamp in ISO 8601 format, or null before Return.
  requestCompletedAt: string | null;
}
