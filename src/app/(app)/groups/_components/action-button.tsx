"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/groups/group.actions";

type Props = {
  /** A Server Action with its arguments already bound. */
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  pendingLabel?: string;
  /** If set, asks for confirmation first. */
  confirmMessage?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  size?: "default" | "sm";
};

/** A button that runs a Server Action and shows its error inline. */
export function ActionButton({
  action,
  children,
  pendingLabel = "Working…",
  confirmMessage,
  variant = "outline",
  size = "sm",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      // On success the action redirects or refreshes the page.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={handleClick}>
        {pending ? pendingLabel : children}
      </Button>
      {error ? (
        <span role="alert" className="max-w-xs text-right text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
