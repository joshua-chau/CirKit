import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import {
  getGroupImage,
  removeGroupImage,
  setGroupImage,
} from "@/server/groups/group-image";
import { ValidationError } from "@/server/errors";

type Context = { params: Promise<{ groupId: string }> };

/**
 * GET: the group picture bytes. Members and invitees only (404 otherwise).
 * Use the `image` URL from GET /api/groups rather than building this path.
 */
export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const user = await requireUser();
    const { groupId } = await context.params;
    const image = await getGroupImage(groupId, user);
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * POST multipart/form-data with an `image` file (JPEG, PNG or WebP, ≤ 2 MiB).
 * Owner only. 200 { data: { image } } with the new picture URL.
 */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const user = await requireUser();
    const { groupId } = await context.params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Send multipart form data with an image file.");
    }
    const file = form.get("image");
    if (!(file instanceof File))
      throw new ValidationError("Send the picture in the image field.");
    return jsonData({ image: await setGroupImage(groupId, user.id, file) });
  } catch (error) {
    return jsonError(error);
  }
}

/** DELETE: remove the group picture. Owner only. 204. */
export async function DELETE(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const user = await requireUser();
    const { groupId } = await context.params;
    await removeGroupImage(groupId, user.id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
