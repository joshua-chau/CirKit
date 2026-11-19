import { requireUser } from "@/lib/require-user";
import { getMyItem, updateItem } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";
import { ItemValidationError, validateUpdateItemInput } from "@/lib/items/item-validation";

type ItemRouteContext = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, context: ItemRouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    const item = await getMyItem(user.id, itemId);
    return Response.json({ data: item }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: ItemRouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    let input: unknown;
    try {
      input = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ItemValidationError("The request body must contain valid JSON.");
      }
      throw error;
    }
    const item = await updateItem(user.id, itemId, validateUpdateItemInput(input));
    return Response.json({ data: item }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
