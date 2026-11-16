import type { GroupItemSummary } from "@/server/groups/group-items";

type Props = {
  /** `null` = the items module isn't connected yet (see group-items.ts). */
  items: GroupItemSummary[] | null;
  viewerId: string;
};

/**
 * Shared items of a group. The list scrolls inside its own box (scroll bar
 * on the right) once it is taller than about 60% of the window.
 */
export function SharedItemList({ items, viewerId }: Props) {
  if (items === null) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        The item list isn&apos;t connected yet.
      </p>
    );
  }
  if (items.length === 0) {
    // The card's description already says the group has no shared items.
    return null;
  }

  return (
    <ul className="max-h-[60vh] divide-y overflow-y-auto pr-3 [scrollbar-gutter:stable]">
      {items.map((item) => (
        <li key={item.itemId} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{item.itemName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.itemCategory} · {item.itemCondition} · from{" "}
              {item.owner.id === viewerId ? "you" : item.owner.name}
            </p>
            {item.itemDescription ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.itemDescription}</p>
            ) : null}
          </div>
          <span
            className={
              item.itemStatus === "AVAILABLE"
                ? "shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            }
          >
            {item.itemStatus === "AVAILABLE" ? "Available" : "Borrowed"}
          </span>
          {/* TODO(items): "Request to borrow" button (createRequest) for other people's available items. */}
        </li>
      ))}
    </ul>
  );
}
