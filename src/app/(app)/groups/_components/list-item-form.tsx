"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/groups/group.actions";
import type { ListableItem } from "@/server/groups/group-items";

type Props = {
  /** listItemInGroupAction bound to the group id. */
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  items: ListableItem[];
  /** Whether the viewer has any active items at all. */
  hasItems: boolean;
};

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50";

/** Lets a member list one of their own items in this group. */
export function ListItemForm({ action, items, hasItems }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {hasItems ? "All your items are listed here. " : "You don't have any items yet. "}
        <Link href="/myitems/new" className="underline underline-offset-4">
          Add an item
        </Link>{" "}
        to share it with this group.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="list-item" className="sr-only">
          Item to list
        </label>
        {/* key resets the selection after each successful listing */}
        <select
          key={items.length}
          id="list-item"
          name="itemId"
          required
          defaultValue=""
          disabled={pending}
          className={selectClassName}
        >
          <option value="" disabled>
            Choose one of your items…
          </option>
          {items.map((item) => (
            <option key={item.itemId} value={item.itemId}>
              {item.itemName}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Listing…" : "List in this group"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Or{" "}
        <Link href="/myitems/new" className="underline underline-offset-4">
          add a new item
        </Link>{" "}
        first.
      </p>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
