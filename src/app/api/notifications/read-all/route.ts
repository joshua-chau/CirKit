import { requireUser } from "@/lib/require-user";
import { jsonError } from "@/server/api-response";
import { markAllNotificationsRead } from "@/server/notifications/notification.service";

export async function PATCH(): Promise<Response> {
  try {
    const user = await requireUser();
    await markAllNotificationsRead(user.id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
