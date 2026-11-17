import type { GroupItemSummary } from "@/server/groups/group-items";
import { unlistItemFromGroupAction } from "@/server/groups/group.actions";
import { ActionButton } from "./action-button";

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
          <li key={item.itemId} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.itemName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.itemCategory} · {item.itemCondition} · from {mine ? "you" : item.owner.name}
              </p>
              {item.itemDescription ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.itemDescription}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start gap-2">
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
                  action={unlistItemFromGroupAction.bind(null, groupId, item.itemId)}
                  pendingLabel="Unlisting…"
                  confirmMessage={`Stop sharing "${item.itemName}" with this group? Pending requests for it here will be declined.`}
                  variant="ghost"
                >
                  Unlist
                </ActionButton>
              ) : null}
              {/* TODO(requests): "Request to borrow" button (createRequest) for other people's available items. */}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
