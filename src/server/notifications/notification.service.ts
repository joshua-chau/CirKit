import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { NotFoundError } from "@/server/errors";
import { publishNotificationChanged } from "@/server/notifications/notification-events";

// Use the caller's transaction so the notification and request change commit together.
export function createRequestNotification(
  transaction: Prisma.TransactionClient,
  data: { recipientId: string; type: NotificationType; requestId: string },
) {
  return transaction.notification.create({ data });
}

// Service functions for managing notifications.
export async function getNotificationsForUser(recipientId: string) {
  const [notifications, unreadCount] = await prisma.$transaction(
    [
      prisma.notification.findMany({
        where: { recipientId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          type: true,
          requestId: true,
          createdAt: true,
          readAt: true,
          request: {
            select: { borrowerId: true, item: { select: { itemName: true } } },
          },
        },
      }),
      prisma.notification.count({ where: { recipientId, readAt: null } }),
    ],
    { isolationLevel: "RepeatableRead" },
  );

  return {
    notifications: notifications.map(({ request, createdAt, readAt, ...notification }) => ({
      ...notification,
      itemName: request.item.itemName,
      direction: request.borrowerId === recipientId ? "borrowing" : "lending",
      createdAt: createdAt.toISOString(),
      readAt: readAt?.toISOString() ?? null,
    })),
    unreadCount,
  };
}

export type NotificationList = Awaited<ReturnType<typeof getNotificationsForUser>>;

// Mark a specific notification as read for a recipient.
export async function markNotificationRead(recipientId: string, notificationId: string) {
  const where = { id: notificationId, recipientId };
  const result = await prisma.notification.updateMany({
    where: { ...where, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count > 0) {
    publishNotificationChanged(recipientId);
    return;
  }

  const notification = await prisma.notification.findUnique({ where, select: { id: true } });
  if (!notification) throw new NotFoundError("Notification not found.");
}
