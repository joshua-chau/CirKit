import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordsToResponseList } from "@/lib/requests/request-response-mapper";
import { getMyRequests } from "@/lib/requests/request-service";

/**
 * GET /api/requests/my-request
 *
 * Lists requests submitted by the authenticated user.
 * Includes all source groups and request statuses.
 * The Service returns an empty list when no requests exist.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const requests = await getMyRequests(user.id);

    const data = mapRequestRecordsToResponseList(requests);
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
