import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { ValidationError } from "@/server/errors";
import {
  removeProfileImage,
  setProfileImage,
} from "@/server/users/profile-image";

/**
 * POST multipart/form-data with an `image` file (JPEG, PNG or WebP, ≤ 2 MiB):
 * sets the signed-in user's profile picture. 200 { data: { image } }.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Send multipart form data with an image file.");
    }
    const file = form.get("image");
    if (!(file instanceof File))
      throw new ValidationError("Send the picture in the image field.");
    return jsonData({ image: await setProfileImage(user.id, file) });
  } catch (error) {
    return jsonError(error);
  }
}

/** DELETE: remove the signed-in user's profile picture. 204. */
export async function DELETE(): Promise<Response> {
  try {
    const user = await requireUser();
    await removeProfileImage(user.id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
