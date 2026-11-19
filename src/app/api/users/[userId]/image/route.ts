import { requireUser } from "@/lib/require-user";
import { jsonError } from "@/server/api-response";
import { getProfileImage } from "@/server/users/profile-image";

type Context = { params: Promise<{ userId: string }> };

/**
 * GET: an uploaded profile picture. Use the user's `image` URL rather than
 * building this path. Visible to the user and people sharing a group with
 * them; 404 otherwise.
 */
export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const viewer = await requireUser();
    const { userId } = await context.params;
    const image = await getProfileImage(userId, viewer.id);
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
