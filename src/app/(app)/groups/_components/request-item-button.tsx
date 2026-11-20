"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTorontoCalendarDate } from "@/lib/requests/request-dates";
import type { RequestActionResult } from "@/server/requests/request.actions";

type Props = {
  // Changed: Accept createRequestAction bound to group and item IDs.
  action: (
    previousState: RequestActionResult | null,
    formData: FormData,
  ) => Promise<RequestActionResult>;
  itemName: string;
};

export function RequestItemButton({ action, itemName }: Props) {
  const [open, setOpen] = useState(false);
  const [minDate, setMinDate] = useState("");
  const [start, setStart] = useState("");
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();

  function openRequestForm(): void {
    // Changed: The picker and backend use the same Toronto calendar helper.
    const currentDate = getTorontoCalendarDate();
    setMinDate(currentDate);
    setOpen(true);
  }

  function closeRequestForm(): void {
    setOpen(false);
  }

  let endMinDate = minDate;
  if (start.length > 0) {
    endMinDate = start;
  }

  let submitLabel = "Send request";
  if (pending) {
    submitLabel = "Sending…";
  }

  if (!open) {
    const button = (
      <Button type="button" size="sm" onClick={openRequestForm}>
        Request
      </Button>
    );

    return button;
  }

  const form = (
    <form
      action={formAction}
      aria-label={"Request to borrow " + itemName}
      className="grid w-full gap-2 rounded-lg border bg-muted/40 p-3 sm:w-auto"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={id + "-start"} className="text-xs">From</Label>
          <Input
            id={id + "-start"}
            name="requestStartDate"
            type="date"
            required
            disabled={pending}
            min={minDate}
            value={start}
            onChange={(event) => {
              const selectedDate = event.target.value;
              setStart(selectedDate);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id + "-end"} className="text-xs">Until</Label>
          <Input
            id={id + "-end"}
            name="requestEndDate"
            type="date"
            required
            disabled={pending}
            min={endMinDate}
          />
        </div>
      </div>
      {/* Changed: Display the Request module's Action result. */}
      {state !== null && !state.ok && (
        <p role="alert" className="text-xs text-destructive">{state.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={closeRequestForm}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>{submitLabel}</Button>
      </div>
    </form>
  );

  return form;
}
