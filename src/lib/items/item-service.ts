import "server-only";

import prisma from "@/lib/prisma";
import type { CreateItemInput, UpdateItemInput } from "@/lib/items/item-validation";
import type { Item } from "@/generated/prisma/client";
import { ItemError } from "@/lib/items/item-errors";

// Expose listing data without including the owner's account or other relations.
const itemSelect = {
  itemId: true,
  ownerId: true,
  itemName: true,
  itemDescription: true,
  itemCategory: true,
  itemCondition: true,
  itemStatus: true,
  itemArchivedAt: true,
  itemCreatedAt: true,
  itemUpdatedAt: true,
} as const;

// currentUserId must come from requireUser(); input must pass validation.
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
  });
}

// Keep the My Items and Archived Items lists separate, scoped to their owner.
export async function getMyItems(currentUserId: string, archived = false) {
  return prisma.item.findMany({
    where: {
      ownerId: currentUserId,
      itemArchivedAt: archived ? { not: null } : null,
    },
    orderBy: [{ itemCreatedAt: "desc" }, { itemId: "desc" }],
    select: itemSelect,
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
  return item;
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
    });
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
    });
  });
}
