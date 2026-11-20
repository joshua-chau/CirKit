import "server-only";

import type { getMyItem } from "@/lib/items/item-service";
import type { ItemDetails } from "@/lib/items/item-types";

type ItemRecord = Awaited<ReturnType<typeof getMyItem>>;

/** Added: Prepare listing data without passing storage keys to Client Components. */
export function mapItemToView(item: ItemRecord): ItemDetails {
  let archivedAt: string | null = null;
  if (item.itemArchivedAt !== null) {
    archivedAt = item.itemArchivedAt.toISOString();
  }
  const updatedAt = item.itemUpdatedAt.toISOString();
  const result: ItemDetails = {
    itemId: item.itemId,
    itemName: item.itemName,
    itemDescription: item.itemDescription,
    itemCategory: item.itemCategory,
    itemCondition: item.itemCondition,
    itemStatus: item.itemStatus,
    itemImageUrl: item.itemImageUrl,
    itemArchivedAt: archivedAt,
    itemUpdatedAt: updatedAt,
  };

  return result;
}
