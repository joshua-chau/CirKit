import "server-only";

import type {
  Request as RequestRecord,
} from "@/generated/prisma/client";
import type {
  RequestResponse,
} from "@/lib/requests/request-types";

/**
 * Converts one database request record into the response used by Controllers.
 * Controllers wrap the result in { data: ... } and create the HTTP response.
 *
 * Calendar dates use their UTC date portion.
 * Timestamps use ISO 8601 strings.
 * Only explicitly listed fields are exposed.
 */
export function mapRequestRecordToResponse(
  request: RequestRecord,
): RequestResponse {
  const startDateIso = request.requestStartDate.toISOString();
  const endDateIso = request.requestEndDate.toISOString();

  const requestStartDate = startDateIso.slice(0, 10);
  const requestEndDate = endDateIso.slice(0, 10);

  const requestCreatedAt = request.requestCreatedAt.toISOString();
  const requestUpdatedAt = request.requestUpdatedAt.toISOString();

  let requestCompletedAt: string | null = null;

  if (request.requestCompletedAt !== null) {
    requestCompletedAt = request.requestCompletedAt.toISOString();
  }

  const response: RequestResponse = {
    requestId: request.requestId,
    itemId: request.itemId,
    borrowerId: request.borrowerId,
    groupId: request.groupId,
    requestStartDate: requestStartDate,
    requestEndDate: requestEndDate,
    requestStatus: request.requestStatus,
    requestCreatedAt: requestCreatedAt,
    requestUpdatedAt: requestUpdatedAt,
    requestCompletedAt: requestCompletedAt,
  };

  return response;
}

/**
 * Converts database request records returned by getMyRequests or getItemRequests.
 * Preserves record order and returns an empty list for an empty input.
 */
export function mapRequestRecordsToResponseList(
  requests: RequestRecord[],
): RequestResponse[] {
  const responses: RequestResponse[] = [];

  for (const request of requests) {
    const response = mapRequestRecordToResponse(request);

    responses.push(response);
  }

  return responses;
}
