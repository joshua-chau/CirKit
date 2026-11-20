import "server-only";

import prisma from "@/lib/prisma";
import type { CreateItemInput, UpdateItemInput } from "@/lib/items/item-validation";
import type { Item } from "@/generated/prisma/client";
import { ItemError } from "@/lib/items/item-errors";
import { uploadImage, readImage, deleteImage } from "@/lib/storage";

// Expose listing data without including the owner's account or other relations.
const itemSelect = {
  itemId: true,
  ownerId: true,
  itemName: true,
  itemDescription: true,
  itemCategory: true,
  itemCondition: true,
  itemImageKey: true,
  itemStatus: true,
  itemArchivedAt: true,
  itemCreatedAt: true,
  itemUpdatedAt: true,
} as const;

function withItemImage<T extends { itemId: string; itemImageKey: string | null }>(item: T) {
  const { itemImageKey, ...listing } = item;
  return {
    ...listing,
    itemImageUrl: itemImageKey ? `/api/items/${encodeURIComponent(item.itemId)}/image` : null,
  };
}

// Changed: currentUserId comes from server session authentication; input is validated.
export async function createItem(currentUserId: string, input: CreateItemInput) {
  return prisma.item.create({
    data: {
      ownerId: currentUserId,
      itemName: input.itemName,
      itemDescription: input.itemDescription,
      itemCategory: input.itemCategory,
      itemCondition: input.itemCondition,
      // Availability, archive flag, ID and timestamps use schema defaults.
    },
    select: itemSelect,
  }).then(withItemImage);
}

// Keep the My Items and Archived Items lists separate, scoped to their owner.
export async function getMyItems(currentUserId: string, archived = false) {
  return prisma.item.findMany({
    where: {
      ownerId: currentUserId,
      itemArchivedAt: archived ? { not: null } : null,
    },
    orderBy: [{ itemCreatedAt: "desc" }, { itemId: "desc" }],
    select: {
      ...itemSelect,
      _count: {
        select: {
          requests: { where: { requestStatus: { in: ["PENDING", "APPROVED"] } } },
        },
      },
    },
  }).then(items => items.map(({ _count, ...item }) => ({
    ...withItemImage(item),
    activeRequestCount: _count.requests,
  })));
}

// Owner-facing request details are separate from the borrower's request list.
export async function getReceivedItemRequests(currentUserId: string, itemId: string) {
  const item = await prisma.item.findUnique({ where: { itemId }, select: { ownerId: true } });
  requireItemOwner(item, currentUserId);
  return prisma.request.findMany({
    where: { itemId },
    include: {
      borrower: { select: { name: true } },
      group: { select: { name: true } },
    },
    orderBy: [{ requestCreatedAt: "desc" }, { requestId: "desc" }],
  });
}

// Group browsing follows ItemAccess rather than item ownership.
export async function getItemsByGroupId(currentUserId: string, groupId: string) {
  return prisma.$transaction(async transaction => {
    const membership = await transaction.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: currentUserId } },
      select: { id: true },
    });
    if (!membership) {
      throw new ItemError("FORBIDDEN", "You must belong to this group to view its items.");
    }
    return transaction.item.findMany({
      where: { itemArchivedAt: null, itemAccesses: { some: { groupId } } },
      orderBy: [{ itemCreatedAt: "desc" }, { itemId: "desc" }],
      select: itemSelect,
    }).then(items => items.map(withItemImage));
  });
}

export async function createItemAccess(currentUserId: string, itemId: string, groupId: string) {
  return prisma.$transaction(async transaction => {
    const items = await transaction.$queryRaw<Item[]>`
      SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
    `;
    requireItemOwner(items[0], currentUserId);
    if (items[0].itemArchivedAt !== null) {
      throw new ItemError("CONFLICT", "Archived items cannot be shared.");
    }
    const membership = await transaction.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: currentUserId } },
      select: { id: true },
    });
    if (!membership) {
      throw new ItemError("FORBIDDEN", "You must belong to this group to share an item with it.");
    }
    // Repeated calls return the existing grant without changing its timestamp.
    return transaction.itemAccess.upsert({
      where: { itemId_groupId: { itemId, groupId } },
      create: { itemId, groupId },
      update: {},
    });
  });
}

export async function deleteItemAccess(currentUserId: string, itemId: string, groupId: string) {
  return prisma.$transaction(async transaction => {
    // Use the same lock as request creation/approval to serialize revocation.
    const items = await transaction.$queryRaw<Item[]>`
      SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
    `;
    requireItemOwner(items[0], currentUserId);
    // Owners may revoke even after leaving a group. Existing loans retain history.
    await transaction.request.updateMany({
      where: { itemId, groupId, requestStatus: "PENDING" },
      data: { requestStatus: "DECLINED" },
    });
    await transaction.itemAccess.deleteMany({ where: { itemId, groupId } });
  });
}

function requireItemOwner(item: { ownerId: string } | null | undefined, userId: string) {
  if (!item) throw new ItemError("NOT_FOUND", "The requested item was not found.");
  if (item.ownerId !== userId) {
    throw new ItemError("FORBIDDEN", "Only the item owner can manage this item.");
  }
}

export async function getMyItem(currentUserId: string, itemId: string) {
  const item = await prisma.item.findUnique({ where: { itemId }, select: itemSelect });
  requireItemOwner(item, currentUserId);
  return withItemImage(item!);
}

export async function updateItem(currentUserId: string, itemId: string, input: UpdateItemInput) {
  return prisma.$transaction(async transaction => {
    const items = await transaction.$queryRaw<Item[]>`
      SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
    `;
    requireItemOwner(items[0], currentUserId);
    // Explicit fields prevent callers from changing ownership or borrowing state.
    return transaction.item.update({
      where: { itemId },
      data: {
        itemName: input.itemName,
        itemDescription: input.itemDescription,
        itemCategory: input.itemCategory,
        itemCondition: input.itemCondition,
      },
      select: itemSelect,
    }).then(withItemImage);
  });
}

export async function archiveItem(currentUserId: string, itemId: string) {
  return prisma.$transaction(async transaction => {
    // Match request-service's lock order so approval cannot race with archiving.
    const items = await transaction.$queryRaw<Item[]>`
      SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
    `;
    const item = items[0];
    requireItemOwner(item, currentUserId);

    const approved = await transaction.request.findFirst({
      where: { itemId, requestStatus: "APPROVED" },
      select: { requestId: true },
    });
    if (item.itemStatus === "BORROWED" || approved !== null) {
      throw new ItemError("CONFLICT", "Return the item or resolve its approved request before archiving.");
    }

    await transaction.request.updateMany({
      where: { itemId, requestStatus: "PENDING" },
      data: { requestStatus: "DECLINED" },
    });
    // Repeated archive calls preserve the original archive timestamp.
    return transaction.item.update({
      where: { itemId },
      data: { itemArchivedAt: item.itemArchivedAt ?? new Date() },
      select: itemSelect,
    }).then(withItemImage);
  });
}

// Cleanup errors do not undo a committed replacement/removal. Log keys for retry.
async function cleanupItemImage(key: string) {
  try {
    await deleteImage(key);
  } catch (error) {
    console.error("Item image cleanup failed; retry deletion for key:", key, error);
  }
}

export async function setItemImage(currentUserId: string, itemId: string, file: File) {
  await getMyItem(currentUserId, itemId);
  const { objectKey } = await uploadImage({ source: { kind: "items", id: itemId }, file });
  let result;
  try {
    result = await prisma.$transaction(async transaction => {
      const items = await transaction.$queryRaw<Item[]>`
        SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
      `;
      requireItemOwner(items[0], currentUserId);
      const item = await transaction.item.update({
        where: { itemId }, data: { itemImageKey: objectKey }, select: itemSelect,
      });
      return { item: withItemImage(item), oldKey: items[0].itemImageKey };
    });
  } catch (error) {
    await cleanupItemImage(objectKey);
    throw error;
  }
  if (result.oldKey) await cleanupItemImage(result.oldKey);
  return result.item;
}

export async function removeItemImage(currentUserId: string, itemId: string) {
  const oldKey = await prisma.$transaction(async transaction => {
    const items = await transaction.$queryRaw<Item[]>`
      SELECT * FROM "Item" WHERE "itemId" = ${itemId} FOR UPDATE
    `;
    requireItemOwner(items[0], currentUserId);
    await transaction.item.update({ where: { itemId }, data: { itemImageKey: null } });
    return items[0].itemImageKey;
  });
  if (oldKey) await cleanupItemImage(oldKey);
}

export async function getItemImage(currentUserId: string, itemId: string) {
  const item = await prisma.item.findUnique({
    where: { itemId },
    select: {
      ownerId: true, itemImageKey: true, itemArchivedAt: true,
      itemAccesses: {
        where: { group: { members: { some: { userId: currentUserId } } } },
        select: { itemAccessId: true }, take: 1,
      },
    },
  });
  if (!item) throw new ItemError("NOT_FOUND", "The requested item was not found.");
  if (item.ownerId !== currentUserId && (item.itemArchivedAt !== null || !item.itemAccesses.length)) {
    throw new ItemError("FORBIDDEN", "You do not have access to this item's image.");
  }
  if (!item.itemImageKey) throw new ItemError("NOT_FOUND", "This item has no image.");
  return readImage(item.itemImageKey);
}
