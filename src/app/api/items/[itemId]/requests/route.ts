import { requireUser } from "@/lib/require-user";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { getReceivedItemRequests } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";

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

    const requests = await getReceivedItemRequests(user.id, itemId);

    const data = requests.map(request => ({
      ...mapRequestRecordToResponse(request),
      borrowerName: request.borrower.name,
      groupName: request.group.name,
    }));
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
    return createItemErrorResponse(error);
  }
}
