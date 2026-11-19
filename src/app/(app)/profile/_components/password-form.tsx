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
  /** True right after a successful change (the action redirects here). */
  changed: boolean;
};

export function PasswordForm({ action, changed }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3">
      <FormField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors?.currentPassword}
      />
      <FormField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors?.newPassword}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors?.confirmPassword}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
        {changed && !state ? (
          <p role="status" className="text-sm text-muted-foreground">
            Password changed. Other devices have been signed out.
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
