import { requireUser } from "@/lib/require-user";
import { getItemsByGroupId } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";

type GroupRouteContext = { params: Promise<{ groupId: string }> };

// GET /api/groups/:groupId/items lists active items shared with this group.
export async function GET(_request: Request, context: GroupRouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { groupId } = await context.params;
    const items = await getItemsByGroupId(user.id, groupId);
    return Response.json({ data: items }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
