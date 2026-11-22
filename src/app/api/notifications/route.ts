import { connection } from "next/server";

import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { getNotificationsForUser } from "@/server/notifications/notification.service";

export async function GET(): Promise<Response> {
  await connection();

  try {
    const user = await requireUser();
    return jsonData(await getNotificationsForUser(user.id));
  } catch (error) {
    return jsonError(error);
  }
}
