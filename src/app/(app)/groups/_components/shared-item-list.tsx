import type { GroupItemSummary } from "@/server/groups/group-items";
import {
  requestItemAction,
  unlistItemFromGroupAction,
} from "@/server/groups/group.actions";
import { ActionButton } from "./action-button";
import { ItemThumbnail } from "./item-thumbnail";
import { RequestItemButton } from "./request-item-button";

type Props = {
  groupId: string;
  items: GroupItemSummary[];
  viewerId: string;
};

/**
 * Items shared with a group. The list scrolls inside its own box (scroll bar
 * on the right) once it is taller than about 60% of the window.
 */
export function SharedItemList({ groupId, items, viewerId }: Props) {
  // The card's description already says when nothing is shared.
  if (items.length === 0) return null;

  return (
    <ul className="scroll-panel max-h-[60vh] divide-y pr-3">
      {items.map((item) => {
        const mine = item.owner.id === viewerId;
        return (
          <li
            key={item.itemId}
            className="flex flex-wrap items-start justify-between gap-3 py-3"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ItemThumbnail src={item.itemImageUrl} name={item.itemName} />
              <div className="min-w-0">
                <p className="truncate font-medium">{item.itemName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.itemCategory} · {item.itemCondition} · from{" "}
                  {mine ? "you" : item.owner.name}
                </p>
                {item.itemDescription ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {item.itemDescription}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <span
                className={
                  item.itemStatus === "AVAILABLE"
                    ? "rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {item.itemStatus === "AVAILABLE" ? "Available" : "Borrowed"}
              </span>
              {mine ? (
                <ActionButton
                  action={unlistItemFromGroupAction.bind(
                    null,
                    groupId,
                    item.itemId,
                  )}
                  pendingLabel="Unlisting…"
                  confirmMessage={`Stop sharing "${item.itemName}" with this group? Pending requests for it here will be declined.`}
                  variant="ghost"
                >
                  Unlist
                </ActionButton>
              ) : null}
              {!mine && item.myRequestStatus ? (
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {item.myRequestStatus === "APPROVED"
                    ? "Approved for you"
                    : "Requested"}
                </span>
              ) : null}
              {!mine &&
              !item.myRequestStatus &&
              item.itemStatus === "AVAILABLE" ? (
                <RequestItemButton
                  action={requestItemAction.bind(null, groupId, item.itemId)}
                  itemName={item.itemName}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
