"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ItemDetails } from "@/lib/items/item-types";
import { loginUrlFor } from "@/lib/routes";
import { archiveItemAction } from "@/server/items/item.actions";

/** Changed: Keep confirmation locally and submit archiving through a Server Action. */
export function ItemArchiveButton({ item }: { item: ItemDetails }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  function archive(): void {
    if (pending || busy.current) {
      return;
    }
    busy.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await archiveItemAction(item.itemId);
        if (!result.ok) {
          if (result.code === "UNAUTHENTICATED") {
            const path = "/myitems/" + encodeURIComponent(item.itemId);
            const loginPath = loginUrlFor(path);
            router.push(loginPath);
            return;
          }
          setError(result.error);
        }
      } catch {
        setError("Could not confirm the archive update. Refresh to check its status.");
      } finally {
        busy.current = false;
      }
    });
  }

  let controls;
  if (item.itemStatus === "BORROWED") {
    controls = <p className="mt-3 text-sm text-muted-foreground">This item must be returned before you can archive it.</p>;
  } else if (confirming) {
    let archiveLabel = "Confirm archive";
    if (pending) {
      archiveLabel = "Archiving…";
    }
    controls = (
      <div role="group" aria-label="Confirm archiving" className="mt-3 space-y-4">
        <p className="text-sm">Archive “{item.itemName}”? Pending requests will be declined. Details and history remain available. Archived items cannot currently be restored.</p>
        <div className="flex gap-3">
          <Button type="button" variant="destructive" disabled={pending} onClick={archive}>{archiveLabel}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => {
            setConfirming(false);
            setError("");
          }}>Cancel</Button>
        </div>
      </div>
    );
  } else {
    controls = <Button type="button" variant="outline" className="mt-3" onClick={() => {
      setConfirming(true);
    }}>Archive item</Button>;
  }

  const section = (
    <section aria-label="Archive item" aria-busy={pending} className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Archive item</h2>
      {controls}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );

  return section;
}
