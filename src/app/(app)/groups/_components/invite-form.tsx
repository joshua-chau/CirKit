"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { ActionResult, InviteResult } from "@/server/groups/group.actions";
import { CopyLinkButton } from "./copy-link-button";

type Result = ActionResult<InviteResult>;

type Props = {
  /** inviteMemberAction bound to the group id. */
  action: (prev: Result | null, formData: FormData) => Promise<Result>;
};

export function InviteForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="grid gap-3">
      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <FormField
            name="email"
            label="Invite by email"
            type="email"
            placeholder="friend@example.com"
            required
            error={fieldErrors?.email}
          />
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </form>

      {state && !state.ok && !fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {state?.ok && state.data ? (
        <div className="grid gap-1 rounded-lg bg-muted p-3 text-sm">
          {state.data.email === "sent" ? (
            <p>
              Invitation emailed. It&apos;s also waiting on their Groups page if they already have
              an account. You can share the link yourself too (it expires in 7 days):
            </p>
          ) : state.data.email === "failed" ? (
            <p>
              Invitation created, but the email couldn&apos;t be sent. Send them this link yourself
              (it expires in 7 days):
            </p>
          ) : (
            <p>
              Invitation created. If they have a CirKit account with this email, it&apos;s waiting
              on their Groups page. Otherwise, send them this link (it expires in 7 days):
            </p>
          )}
          <CopyLinkButton path={state.data.invitePath} />
        </div>
      ) : null}
    </div>
  );
}
