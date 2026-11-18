"use client";

import { useActionState } from "react";

import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/lib/validation/group.schema";
import type { ActionResult } from "@/server/groups/group.actions";

type Props = {
  /** createGroupAction, or updateGroupAction bound to a group id. */
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaultValues?: { name: string; description: string | null };
  submitLabel: string;
  pendingLabel: string;
};

/** Name + description form, used to create a group and to edit one. */
export function GroupForm({ action, defaultValues, submitLabel, pendingLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4">
      <FormField
        name="name"
        label="Name"
        required
        maxLength={GROUP_NAME_MAX}
        defaultValue={defaultValues?.name}
        error={fieldErrors?.name}
      />
      <div className="grid gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={GROUP_DESCRIPTION_MAX}
          defaultValue={defaultValues?.description ?? ""}
          aria-invalid={fieldErrors?.description ? true : undefined}
        />
        {fieldErrors?.description ? (
          <p className="text-sm text-destructive">{fieldErrors.description}</p>
        ) : null}
      </div>

      {state && !state.ok && !fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
