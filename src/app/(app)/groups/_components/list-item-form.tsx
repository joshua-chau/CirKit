"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ItemAccessActionResult } from "@/server/items/item.actions";
import type { ListableItem } from "@/server/groups/group-items";

type Props = {
  // Changed: Accept the Item module's share Action, bound to the group ID.
  action: (
    previousState: ItemAccessActionResult | null,
    formData: FormData,
  ) => Promise<ItemAccessActionResult>;
  items: ListableItem[];
  hasItems: boolean;
};

const selectClassName = "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50";

export function ListItemForm({ action, items, hasItems }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  if (items.length === 0) {
    let message = "You don't have any items yet. ";
    if (hasItems) {
      message = "All your items are listed here. ";
    }
    const empty = (
      <p className="text-sm text-muted-foreground">
        {message}<Link href="/myitems/new" className="underline underline-offset-4">Add an item</Link> to share it with this group.
      </p>
    );

    return empty;
  }
  let submitLabel = "List in this group";
  if (pending) {
    submitLabel = "Listing…";
  }
  const view = (
    <div className="grid gap-2">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="list-item" className="sr-only">Item to list</label>
        <select key={items.length} id="list-item" name="itemId" required defaultValue="" disabled={pending} className={selectClassName}>
          <option value="" disabled>Choose one of your items…</option>
          {items.map((item) => {
            const option = <option key={item.itemId} value={item.itemId}>{item.itemName}</option>;
            return option;
          })}
        </select>
        <Button type="submit" disabled={pending} className="shrink-0">{submitLabel}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Or <Link href="/myitems/new" className="underline underline-offset-4">add a new item</Link> first.</p>
      {/* Changed: Share failures now come from ItemAccessActionResult. */}
      {state !== null && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    </div>
  );

  return view;
}
