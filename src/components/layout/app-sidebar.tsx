"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";

import { GroupForm } from "@/app/(app)/groups/_components/group-form";
import { Avatar } from "@/components/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createGroupAction } from "@/server/groups/group.actions";

export function AppSidebar({ groups }: { groups: { id: string; name: string; image: string | null }[] }) {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();
  const groupListId = useId();
  const toggleLabel = expanded ? "Collapse sidebar" : "Expand sidebar";

  return (
    <aside
      aria-label="My groups"
      className={cn(
        "sticky top-16 flex h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground",
        expanded ? "w-52" : "w-16",
      )}
    >
      <div id={groupListId} className="min-h-0 flex-1 overflow-y-auto">
        {expanded && (
          <h2 className="mb-3 px-2 pt-2 text-xs font-semibold tracking-wide text-muted-foreground">My groups</h2>
        )}
        {expanded && groups.length === 0 && (
          <p className="mb-3 px-2 text-sm text-muted-foreground">No groups yet.</p>
        )}
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.id} title={group.name}>
              <Link
                href={`/groups/${group.id}`}
                aria-label={group.name}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "h-10 w-full gap-2.5 px-1",
                  expanded ? "justify-start" : "justify-center",
                )}
              >
                <Avatar src={group.image} name={group.name} size="xs" />
                {expanded && <span className="min-w-0 truncate">{group.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <Dialog.Root key={pathname}>
          <Dialog.Trigger
            type="button"
            aria-label="Create group"
            title="Create group"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-3 h-9 w-full gap-2.5",
              expanded ? "justify-start px-2.5" : "px-0",
            )}
          >
            <Plus aria-hidden="true" />
            {expanded && "Create group"}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-30 bg-black/30" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 z-40 max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 text-card-foreground shadow-lg [font-family:var(--font-geist-sans)]">
              <div className="mb-4 pr-8">
                <Dialog.Title className="text-lg font-semibold">Create a group</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  You&apos;ll be its owner and can invite others.
                </Dialog.Description>
              </div>
              <GroupForm
                action={createGroupAction}
                submitLabel="Create group"
                pendingLabel="Creating…"
              />
              <Dialog.Close
                type="button"
                aria-label="Close"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "absolute top-3 right-3")}
              >
                <X aria-hidden="true" />
              </Dialog.Close>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <div className="mt-3 border-t border-sidebar-border pt-3">
        <Button
          type="button"
          variant="ghost"
          aria-controls={groupListId}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={cn("h-9 w-full gap-2.5", expanded ? "justify-start px-2.5" : "px-0")}
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          {expanded && toggleLabel}
        </Button>
      </div>
    </aside>
  );
}
