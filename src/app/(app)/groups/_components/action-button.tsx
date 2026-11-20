"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FeedbackToast } from "@/components/ui/feedback-toast";
import type { ActionResult } from "@/server/groups/group.actions";

type Props = {
  /** A Server Action with its arguments already bound. */
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  pendingLabel?: string;
  /** If set, asks for confirmation first. */
  confirmMessage?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  size?: "default" | "sm";
  errorToastTitle?: string;
  /** If set, a success result carrying `data.message` shows a toast with this title. */
  successToastTitle?: string;
};

/** A button that runs a Server Action and displays any returned error. */
export function ActionButton({
  action,
  children,
  pendingLabel = "Working…",
  confirmMessage,
  variant = "outline",
  size = "sm",
  errorToastTitle,
  successToastTitle,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      // On success the action redirects or refreshes the page.
      if (result && !result.ok) setError(result.error);
      const message = result?.ok ? (result.data as { message?: unknown } | undefined)?.message : undefined;
      if (successToastTitle && typeof message === "string") setNotice(message);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={handleClick}>
        {pending ? pendingLabel : children}
      </Button>
      {error && errorToastTitle ? (
        <FeedbackToast
          title={errorToastTitle}
          description={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
      ) : error ? (
        <span role="alert" className="max-w-xs text-right text-xs text-destructive">
          {error}
        </span>
      ) : null}
      {notice && successToastTitle ? (
        <FeedbackToast title={successToastTitle} description={notice} onDismiss={() => setNotice(null)} />
      ) : null}
    </span>
  );
}
