import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import type { GroupInput } from "@/lib/validation/group.schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { publishNotificationChanged } from "@/server/notifications/notification-events";
import { createRequestNotification } from "@/server/notifications/notification.service";
import { cleanupGroupImage } from "./group-image";
import { lockGroup } from "./group.lock";
import { requireGroupMember, requireGroupOwner } from "./group.permissions";

type Tx = Prisma.TransactionClient;


/** Creates a group with the creator as its OWNER, in one statement. */
export async function createGroup(userId: string, input: GroupInput) {
  return prisma.group.create({
    data: {
      name: input.name,
      description: input.description,
      members: { create: { userId, role: "OWNER" } },
    },
    select: { id: true },
  });
}

/** Owner only: edit name and description. */
export async function updateGroup(groupId: string, userId: string, input: GroupInput) {
  await requireGroupOwner(groupId, userId);
  await prisma.group.update({
    where: { id: groupId },
    data: { name: input.name, description: input.description },
  });
}

/**
 * Removes `userId` from the group, applying the borrowing rules
 * (decision 2026-11-15, mirrors the spec's "revoke group access" rules):
 *
 * - Refused while the user has an APPROVED request in this group, either as
 *   the borrower or as the owner of the item (reserved or borrowed).
 * - Their PENDING requests as a borrower are CANCELLED. Pending requests for
 *   their own items are DECLINED, and those items stop being shared here.
 *
 * Locks the affected Item rows the same way request-service does
 * (SELECT … FOR UPDATE), so an approval cannot slip in mid-way.
 */
async function detachMember(tx: Tx, groupId: string, userId: string) {
  await tx.$queryRaw`
    SELECT i."itemId"
    FROM "Item" i
    WHERE (
        i."ownerId" = ${userId}
        AND EXISTS (
          SELECT 1 FROM "ItemAccess" a
          WHERE a."itemId" = i."itemId" AND a."groupId" = ${groupId}
        )
      )
      OR EXISTS (
        SELECT 1 FROM "Request" r
        WHERE r."itemId" = i."itemId"
          AND r."groupId" = ${groupId}
          AND r."borrowerId" = ${userId}
          AND r."requestStatus" IN ('PENDING', 'APPROVED')
      )
    ORDER BY i."itemId"
    FOR UPDATE
  `;

  const involvesUser: Prisma.RequestWhereInput = {
    groupId,
    OR: [{ borrowerId: userId }, { item: { ownerId: userId } }],
  };

  const approved = await tx.request.count({
    where: { ...involvesUser, requestStatus: "APPROVED" },
  });
  if (approved > 0) {
    throw new ConflictError(
      "There is an approved or ongoing borrow in this group involving this member. " +
        "It must be returned or cancelled first.",
    );
  }

  const cancelledRequests = await tx.request.updateManyAndReturn({
    where: { groupId, borrowerId: userId, requestStatus: "PENDING" },
    data: { requestStatus: "CANCELLED" },
    select: { requestId: true, borrowerId: true, item: { select: { ownerId: true } } },
  });

  const declinedRequests = await tx.request.updateManyAndReturn({
    where: { groupId, item: { ownerId: userId }, requestStatus: "PENDING" },
    data: { requestStatus: "DECLINED" },
    select: { requestId: true, borrowerId: true, item: { select: { ownerId: true } } },
  });

  const recipientIds = new Set<string>();
  for (const request of [...cancelledRequests, ...declinedRequests]) {
    const cancelled = request.borrowerId === userId;
    // A departing borrower notifies the item owner; a departing owner notifies the borrower.
    const recipientId = cancelled ? request.item.ownerId : request.borrowerId;
    await createRequestNotification(tx, {
      recipientId,
      type: cancelled ? NotificationType.REQUEST_CANCELLED : NotificationType.REQUEST_DECLINED,
      requestId: request.requestId,
    });
    recipientIds.add(recipientId);
  }

  await tx.itemAccess.deleteMany({ where: { groupId, item: { ownerId: userId } } });
  await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
  return recipientIds;
}

/** A member leaves. The owner must transfer ownership first. */
export async function leaveGroup(groupId: string, userId: string) {
  const recipientIds = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const membership = await requireGroupMember(groupId, userId, tx);

    if (membership.role === "OWNER") {
      const memberCount = await tx.groupMember.count({ where: { groupId } });
      throw new ConflictError(
        memberCount > 1
          ? "Transfer ownership to another member in Settings before leaving."
          : "You are the only member. Delete the group in Settings instead.",
      );
    }

    return detachMember(tx, groupId, userId);
  });

  // Membership, request changes and notifications must commit before sending SSE.
  for (const recipientId of recipientIds) {
    publishNotificationChanged(recipientId);
  }
}

/** Owner only: remove another member. */
export async function removeMember(groupId: string, ownerId: string, memberUserId: string) {
  if (memberUserId === ownerId) {
    throw new ValidationError("You cannot remove yourself. Transfer ownership, then leave.");
  }
  const recipientIds = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await requireGroupOwner(groupId, ownerId, tx);

    const target = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: memberUserId } },
    });
    if (!target) throw new NotFoundError("That user is not a member of this group.");

    return detachMember(tx, groupId, memberUserId);
  });

  for (const recipientId of recipientIds) {
    publishNotificationChanged(recipientId);
  }
}

/** Owner only: make another member the owner; the old owner becomes a MEMBER. */
export async function transferOwnership(groupId: string, ownerId: string, newOwnerUserId: string) {
  if (newOwnerUserId === ownerId) {
    throw new ValidationError("You are already the owner.");
  }
  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await requireGroupOwner(groupId, ownerId, tx);

    const target = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: newOwnerUserId } },
    });
    if (!target) throw new NotFoundError("That user is not a member of this group.");

    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: ownerId } },
      data: { role: "MEMBER" },
    });
    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: newOwnerUserId } },
      data: { role: "OWNER" },
    });
  });
}

/**
 * Owner only, and only when they are the last member and the group has no
 * shared items or borrow history (Item/Request rows reference the group
 * with ON DELETE RESTRICT, and history must be kept).
 */
export async function deleteGroup(groupId: string, ownerId: string) {
  const imageKey = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await requireGroupOwner(groupId, ownerId, tx);

    const [members, sharedItems, requests] = await Promise.all([
      tx.groupMember.count({ where: { groupId } }),
      tx.itemAccess.count({ where: { groupId } }),
      tx.request.count({ where: { groupId } }),
    ]);
    if (members > 1) {
      throw new ConflictError("Remove the other members before deleting the group.");
    }
    if (sharedItems > 0 || requests > 0) {
      throw new ConflictError(
        "This group has shared items or borrow history, so it cannot be deleted.",
      );
    }

    // Members and invitations are removed by ON DELETE CASCADE.
    const deleted = await tx.group.delete({ where: { id: groupId }, select: { image: true } });
    return deleted.image;
  });
  // Remove the picture from storage only after the group is really gone.
  if (imageKey) await cleanupGroupImage(imageKey);
}
