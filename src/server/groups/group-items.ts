import "server-only";

import type { Item } from "@/generated/prisma/client";
import { requireGroupMember } from "./group.permissions";

/**
 * SKELETON — the group page's link to the items module.
 *
 * The group page only displays items; the items module owns the query.
 * This file is the single place where the two meet, so wiring it up later
 * is a change to this file only.
 *
 * Needed from the items module (src/lib/items/item-service.ts):
 *
 *   getGroupItems(groupId: string): Promise<GroupItemSummary[]>
 *     - items that have an ItemAccess row for `groupId`
 *     - excluding archived items (itemArchivedAt = null)
 *     - each with its owner's { id, name, image }
 *     - newest first (itemCreatedAt desc, itemId desc — same as getMyItems)
 *     - membership is checked here before the call, so it needs no user id
 *
 * Needed later for the buttons on each row (not used by this file yet):
 *   - shareItemWithGroup(currentUserId, itemId, groupId) / unshareItemFromGroup(...)
 *     to create/delete the ItemAccess row ("Share one of my items" button)
 *   - createRequest(...) already exists in src/lib/requests/request-service.ts
 *     ("Request to borrow" button)
 */
export type GroupItemSummary = Pick<
  Item,
  "itemId" | "itemName" | "itemDescription" | "itemCategory" | "itemCondition" | "itemStatus"
> & {
  owner: { id: string; name: string; image: string | null };
};

/**
 * Items shared with a group, for its members. Throws NotFoundError for
 * non-members. Returns `null` while the items module's function doesn't
 * exist yet, so the page can say "not connected" instead of "no items".
 */
export async function getSharedItemsForGroup(
  groupId: string,
  userId: string,
): Promise<GroupItemSummary[] | null> {
  await requireGroupMember(groupId, userId);

  // TODO(items): replace the line below with
  //   return getGroupItems(groupId);
  // imported from "@/lib/items/item-service".
  return null;
}
