import { requireUser } from "@/lib/require-user";
import { createItemAccess, deleteItemAccess } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";

type AccessRouteContext = { params: Promise<{ itemId: string; groupId: string }> };

// POST /api/items/:itemId/access/:groupId grants access (idempotently).
export async function POST(_request: Request, context: AccessRouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { itemId, groupId } = await context.params;
    const access = await createItemAccess(user.id, itemId, groupId);
    return Response.json({ data: access }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}

// DELETE /api/items/:itemId/access/:groupId revokes access (idempotently).
export async function DELETE(_request: Request, context: AccessRouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { itemId, groupId } = await context.params;
    await deleteItemAccess(user.id, itemId, groupId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
