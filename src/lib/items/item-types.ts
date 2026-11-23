import type { ItemStatus } from "@/generated/prisma/enums";

export const ITEM_CATEGORIES = ["Power tools", "Hand tools", "Home & kitchen", "Garden & outdoor", "Electronics", "Sports & recreation", "Other"] as const;
export const ITEM_CONDITIONS = ["Like new", "Good", "Normal", "Poor"] as const;

export interface ItemFilters {
  category?: string;
  condition?: string;
  availability?: ItemStatus;
}

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

export interface ItemSharingGroup {
  groupId: string;
  groupName: string;
  isMember: boolean;
  isShared: boolean;
}
