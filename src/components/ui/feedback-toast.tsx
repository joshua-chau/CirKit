"use client";

import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FeedbackToast({ title, description, tone = "success", onDismiss }: {
  title: string;
  description?: string;
  tone?: "success" | "error";
  onDismiss: () => void;
}) {
  const dismissAfterTimeout = useEffectEvent(onDismiss);

  useEffect(() => {
    const timeout = window.setTimeout(() => dismissAfterTimeout(), 8000);
    return () => window.clearTimeout(timeout);
  }, [title, description]);

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-30 flex w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 items-start gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg [font-family:var(--font-geist-sans)]">
      <div role={tone === "error" ? "alert" : "status"} className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss message" onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>,
    document.body,
  );
}
