"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/server/groups/group.actions";

type Props = {
  /** requestItemAction bound to the group and item ids. */
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  itemName: string;
};

/** Today's date in the viewer's time zone, as YYYY-MM-DD. */
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** "Request" button that opens a small date form to ask to borrow an item. */
export function RequestItemButton({ action, itemName }: Props) {
  const [open, setOpen] = useState(false);
  const [minDate, setMinDate] = useState("");
  const [start, setStart] = useState("");
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setMinDate(today());
          setOpen(true);
        }}
      >
        Request
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-label={`Request to borrow ${itemName}`}
      className="grid w-full gap-2 rounded-lg border bg-muted/40 p-3 sm:w-auto"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-start`} className="text-xs">
            From
          </Label>
          <Input
            id={`${id}-start`}
            name="requestStartDate"
            type="date"
            required
            min={minDate}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-end`} className="text-xs">
            Until
          </Label>
          <Input id={`${id}-end`} name="requestEndDate" type="date" required min={start || minDate} />
        </div>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
