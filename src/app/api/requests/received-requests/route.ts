import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { getReceivedRequests } from "@/lib/requests/request-service";
import type { LendingItemResponse } from "@/lib/requests/request-types";

/**
 * GET /api/requests/received-requests
 *
 * Lists requests received for the authenticated user's own items.
 * Includes display names, all source groups, and all request statuses.
 * Returns an empty data array when no requests exist.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const requests = await getReceivedRequests(user.id);

    const data: LendingItemResponse[] = [];

    for (const request of requests) {
      const requestResponse = mapRequestRecordToResponse(request);

      const lendingItem: LendingItemResponse = {
        ...requestResponse,
        itemName: request.item.itemName,
        borrowerName: request.borrower.name,
        groupName: request.group.name,
      };

      data.push(lendingItem);
    }

    const body = {
      data: data,
    };

    const response = Response.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });

    return response;
  } catch (error) {
    const response = createRequestErrorResponse(error);

    return response;
  }
}
