import { requireUser } from "@/lib/require-user";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordsToResponseList } from "@/lib/requests/request-response-mapper";
import { getItemRequests } from "@/lib/requests/request-service";

type ItemRouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

/**
 * GET /api/items/[itemId]/requests
 *
 * Reads the item identifier from the route.
 * The Service verifies that the authenticated user owns the item
 * before returning its received requests.
 */
export async function GET(
  _httpRequest: Request,
  context: ItemRouteContext,
): Promise<Response> {
  try {
    const user = await requireUser();

    // Dynamic route parameters are asynchronous in this Next.js version.
    const params = await context.params;
    const itemId = params.itemId;

    const requests = await getItemRequests(user.id, itemId);

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
