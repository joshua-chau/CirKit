"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ItemRefreshButton } from "@/components/items/item-refresh-button";
import type { ItemSharingGroup } from "@/lib/items/item-types";
import { shareItemWithGroupAction, unshareItemFromGroupAction } from "@/server/items/item.actions";

export function ItemGroupSharing({ itemId, archived, groups }: {
  itemId: string;
  archived: boolean;
  groups: ItemSharingGroup[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function changeSharing(group: ItemSharingGroup) {
    if (pending || busy.current || (!group.isShared && (archived || !group.isMember))) return;
    busy.current = true;
    setError("");
    startTransition(async () => {
      try {
        let result;
        if (group.isShared) {
          result = await unshareItemFromGroupAction(group.groupId, itemId);
        } else {
          const form = new FormData();
          form.set("itemId", itemId);
          result = await shareItemWithGroupAction(group.groupId, null, form);
        }
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setConfirmGroupId(null);
        // Actions revalidate item/group views; refresh also clears stale controls.
        router.refresh();
      } catch {
        setError("Could not confirm the sharing update. Refresh to check its status before retrying.");
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <section aria-label="Group sharing" aria-busy={pending} className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Group sharing</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose which groups can see and request this item.</p>
      {archived && <p className="mt-2 text-sm text-muted-foreground">Archived items are hidden from group listings. You can remove existing shares, but cannot add new ones.</p>}
      {groups === null ? (
        <div className="mt-4 space-y-3">
          <p role="alert">Unable to load group sharing.</p>
          <ItemRefreshButton label="Try again" />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You have no groups to share with. <Link href="/groups" className="underline">View groups</Link></p>
      ) : (
        <ul className="mt-4 divide-y">
          {groups.map(group => (
            <li key={group.groupId} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {group.isMember ? <Link href={`/groups/${encodeURIComponent(group.groupId)}`} className="break-words font-medium hover:underline">{group.groupName}</Link>
                    : <p className="break-words font-medium">{group.groupName}</p>}
                  <p className="text-sm text-muted-foreground">{group.isShared ? "Shared" : "Not shared"}{!group.isMember ? " · You are no longer a member" : ""}</p>
                </div>
                <Button type="button" variant="outline" disabled={pending || (!group.isShared && (archived || !group.isMember))}
                  aria-label={`${group.isShared ? "Stop sharing with" : "Share with"} ${group.groupName}`}
                  onClick={() => {
                    setError("");
                    if (group.isShared) setConfirmGroupId(group.groupId);
                    else { setConfirmGroupId(null); changeSharing(group); }
                  }}>{group.isShared ? "Stop sharing" : "Share"}</Button>
              </div>
              {group.isShared && confirmGroupId === group.groupId && (
                <div role="group" aria-label={`Confirm removing access for ${group.groupName}`} className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm">Stop sharing with {group.groupName}? Pending requests from this group will be declined. Existing loans and request history are preserved.</p>
                  <div className="flex gap-3">
                    <Button type="button" variant="destructive" disabled={pending} onClick={() => changeSharing(group)}>{pending ? "Saving..." : "Confirm stop sharing"}</Button>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirmGroupId(null); setError(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && <p role="status" className="mt-3 text-sm">Updating group sharing...</p>}
      {error && <div className="mt-3 space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><ItemRefreshButton label="Refresh sharing" /></div>}
    </section>
  );
}
