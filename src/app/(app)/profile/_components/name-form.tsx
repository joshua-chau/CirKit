"use client";

import { useActionState } from "react";

import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/groups/group.actions";

type Props = {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  name: string;
};

export function NameForm({ action, name }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3">
      <FormField
        name="name"
        label="Name"
        defaultValue={name}
        required
        maxLength={80}
        error={fieldErrors?.name}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {state?.ok ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saved.
          </p>
        ) : null}
        {state && !state.ok && !fieldErrors ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
