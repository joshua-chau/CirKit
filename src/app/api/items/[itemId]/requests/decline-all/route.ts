import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { declineAllPendingRequests } from "@/lib/requests/request-service";

type ItemRouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

/**
 * POST /api/items/[itemId]/requests/decline-all
 *
 * No request body is required.
 * The Service verifies ownership and declines all current Pending requests.
 * A declined count of zero is still a successful result.
 */
export async function POST(
  _httpRequest: Request,
  context: ItemRouteContext,
): Promise<Response> {
  try {
    const user = await requireUser();

    const params = await context.params;
    const itemId = params.itemId;

    const declinedCount = await declineAllPendingRequests(
      user.id,
      itemId,
    );

    const body = {
      data: {
        declinedCount: declinedCount,
      },
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
