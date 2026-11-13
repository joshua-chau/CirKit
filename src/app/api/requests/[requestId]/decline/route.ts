import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { declineRequest } from "@/lib/requests/request-service";

type RequestRouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

/**
 * POST /api/requests/[requestId]/decline
 *
 * No request body is required.
 * The Service verifies item ownership and declines only
 * the selected Pending request.
 */
export async function POST(
  _httpRequest: Request,
  context: RequestRouteContext,
): Promise<Response> {
  try {
    const user = await requireUser();

    const params = await context.params;
    const requestId = params.requestId;

    const updatedRequest = await declineRequest(
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
