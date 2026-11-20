"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Added: Retry server reads without fetching a separate JSON API. */
export function ItemRefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  let buttonLabel = label;
  if (pending) {
    buttonLabel = "Refreshing…";
  }

  function refresh(): void {
    startTransition(() => {
      router.refresh();
    });
  }

  const button = (
    <Button type="button" variant="outline" disabled={pending} onClick={refresh}>
      {buttonLabel}
    </Button>
  );

  return button;
}
