import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { approveRequest } from "@/lib/requests/request-service";

type RequestRouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

/**
 * POST /api/requests/[requestId]/approve
 *
 * No request body is required.
 * The Service verifies ownership, approves the selected request,
 * declines other Pending requests, and marks the item as Borrowed.
 */
export async function POST(
  _httpRequest: Request,
  context: RequestRouteContext,
): Promise<Response> {
  try {
    const user = await requireUser();

    const params = await context.params;
    const requestId = params.requestId;

    const updatedRequest = await approveRequest(
      user.id,
      requestId,
    );

    const data = mapRequestRecordToResponse(updatedRequest);
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
