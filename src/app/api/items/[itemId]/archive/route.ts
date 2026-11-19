import { requireUser } from "@/lib/require-user";
import { archiveItem } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";

// No request body is required. Item and request history are retained.
export async function POST(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    const item = await archiveItem(user.id, itemId);
    return Response.json({ data: item }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
