import { requireUser } from "@/lib/require-user";
import { getItemImage, getMyItem, setItemImage, removeItemImage } from "@/lib/items/item-service";
import { createItemErrorResponse } from "@/lib/items/item-error-response";
import { ItemValidationError } from "@/lib/items/item-validation";

type Context = { params: Promise<{ itemId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    const image = await getItemImage(user.id, itemId);
    return new Response(image.body, {
      headers: { ...headers, "Content-Type": image.contentType, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    await getMyItem(user.id, itemId);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ItemValidationError("Provide multipart form data with an image file.");
    }
    const file = form.get("image");
    if (!(file instanceof File)) throw new ItemValidationError("Provide an image file in the image field.");
    const item = await setItemImage(user.id, itemId, file);
    return Response.json({ data: item }, { headers });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { itemId } = await context.params;
    await removeItemImage(user.id, itemId);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return createItemErrorResponse(error);
  }
}
