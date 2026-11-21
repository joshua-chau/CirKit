import type { ItemStatus } from "@/generated/prisma/enums";

// Added: Explicit, serializable item fields shared by server and client views.
export interface ItemDetails {
  itemId: string;
  itemName: string;
  itemDescription: string;
  itemCategory: string;
  itemCondition: string;
  itemStatus: ItemStatus;
  itemImageUrl: string | null;
  itemArchivedAt: string | null;
  itemUpdatedAt: string;
}

export interface ItemSummary extends ItemDetails {
  activeRequestCount: number;
}
