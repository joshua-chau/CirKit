import { requireUser } from "@/lib/require-user";
import { jsonError } from "@/server/api-response";
import { markNotificationRead } from "@/server/notifications/notification.service";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { notificationId } = await params;
    await markNotificationRead(user.id, notificationId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
