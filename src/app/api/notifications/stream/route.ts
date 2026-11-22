import { connection } from "next/server";

import { requireUser } from "@/lib/require-user";
import { jsonError } from "@/server/api-response";
import { subscribeToNotificationChanges } from "@/server/notifications/notification-events";

const encoder = new TextEncoder();
const readyEvent = encoder.encode("event: ready\ndata: {}\n\n");
const changedEvent = encoder.encode("event: notification.changed\ndata: {}\n\n");
const heartbeat = encoder.encode(": keep-alive\n\n");

function createNotificationStream(recipientId: string, signal: AbortSignal) {
  let cleanup: (() => void) | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal.aborted) {
        controller.close();
        return;
      }

      function close() {
        cleanup?.();
        controller.close();
      }

      const unsubscribe = subscribeToNotificationChanges(recipientId, () => {
        if ((controller.desiredSize ?? 0) > 0) {
          controller.enqueue(changedEvent);
        } else {
          // The browser will reconnect and read the latest notifications.
          close();
        }
      });
      const heartbeatTimer = setInterval(() => {
        if ((controller.desiredSize ?? 0) > 0) controller.enqueue(heartbeat);
      }, 15_000);

      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeatTimer);
        signal.removeEventListener("abort", close);
      };
      signal.addEventListener("abort", close, { once: true });
      controller.enqueue(readyEvent);
    },
    cancel() {
      cleanup?.();
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    const user = await requireUser();
    return new Response(createNotificationStream(user.id, request.signal), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
