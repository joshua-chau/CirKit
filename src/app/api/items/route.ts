import { requireUser } from "@/lib/require-user";
import { createItem, getMyItems } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";
import {
  ItemValidationError,
  validateCreateItemInput,
} from "@/lib/items/item-validation";

// POST /api/items: create a listing for the authenticated user.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    let input: unknown;
    try {
      input = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ItemValidationError("The request body must contain valid JSON.");
      }
      throw error;
    }

    const item = await createItem(user.id, validateCreateItemInput(input));
    return Response.json({ data: item }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}

// GET /api/items lists unarchived items; ?archived=true lists archived items.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const archivedParam = new URL(request.url).searchParams.get("archived");
    if (archivedParam !== null && archivedParam !== "true" && archivedParam !== "false") {
      throw new ItemValidationError("archived must be true or false.");
    }
    const items = await getMyItems(user.id, archivedParam === "true");
    return Response.json({ data: items }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
