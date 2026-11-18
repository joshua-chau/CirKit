import "server-only";

import prisma from "@/lib/prisma";
import { getItemsByGroupId, getMyItems } from "@/lib/items/item-service";
import { getMyRequests } from "@/lib/requests/request-service";
import { requireGroupMember } from "./group.permissions";

/**
 * The group page's link to the items module. The items module owns the
 * item queries and rules; this file only adapts them for the group page.
 */

type ServiceItem = Awaited<ReturnType<typeof getItemsByGroupId>>[number];

export type GroupItemSummary = Pick<
  ServiceItem,
  | "itemId"
  | "itemName"
  | "itemDescription"
  | "itemCategory"
  | "itemCondition"
  | "itemStatus"
  // Same-origin /api/items/{id}/image (members only), or null if no picture.
  | "itemImageUrl"
> & {
  owner: { id: string; name: string; image: string | null };
  /** The viewer's open request for this item in this group, if any. */
  myRequestStatus: "PENDING" | "APPROVED" | null;
};

/**
 * Items shared with a group, for its members, newest first. Throws
 * NotFoundError for non-members (so the page can 404).
 */
export async function getSharedItemsForGroup(groupId: string, userId: string): Promise<GroupItemSummary[]> {
  await requireGroupMember(groupId, userId);
  const [items, myRequests] = await Promise.all([
    getItemsByGroupId(userId, groupId),
    getMyRequests(userId),
  ]);

  // The viewer's open requests made through this group, by item.
  const openRequest = new Map<string, "PENDING" | "APPROVED">();
  for (const request of myRequests) {
    if (request.groupId !== groupId) continue;
    const status = request.requestStatus;
    if (status === "APPROVED" || (status === "PENDING" && !openRequest.has(request.itemId))) {
      openRequest.set(request.itemId, status);
    }
  }

  // getItemsByGroupId returns ownerId only; look up the owners' names here.
  // An owner may no longer be a member, so don't rely on the member list.
  const ownerIds = [...new Set(items.map((item) => item.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, image: true },
  });
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  return items.map((item) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    itemDescription: item.itemDescription,
    itemCategory: item.itemCategory,
    itemCondition: item.itemCondition,
    itemStatus: item.itemStatus,
    itemImageUrl: item.itemImageUrl,
    owner: ownerById.get(item.ownerId) ?? { id: item.ownerId, name: "Unknown", image: null },
    myRequestStatus: openRequest.get(item.itemId) ?? null,
  }));
}

/** The viewer's active items that aren't listed in this group yet. */
export async function getListableItems(userId: string, sharedItems: GroupItemSummary[]) {
  const listed = new Set(sharedItems.map((item) => item.itemId));
  const mine = await getMyItems(userId);
  return {
    hasItems: mine.length > 0,
    items: mine
      .filter((item) => !listed.has(item.itemId))
      .map((item) => ({ itemId: item.itemId, itemName: item.itemName })),
  };
}

export type ListableItem = Awaited<ReturnType<typeof getListableItems>>["items"][number];
