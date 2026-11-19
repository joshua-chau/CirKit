"use client";

import { useId, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppSidebar({ groups }: { groups: { id: string; name: string }[] }) {
  const [expanded, setExpanded] = useState(true);
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
              {/* TODO: Link to this Group’s page when the route exists. */}
              <Button
                type="button"
                variant="ghost"
                aria-label={group.name}
                className={cn("h-10 w-full gap-2.5 px-1", expanded ? "justify-start" : "justify-center")}
                disabled
              >
                {/* TODO: Use the uploaded Group avatar once the image field and read route are ready. */}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold">
                  {Array.from(group.name.trim())[0]?.toUpperCase() ?? "?"}
                </span>
                {expanded && <span className="min-w-0 truncate">{group.name}</span>}
              </Button>
            </li>
          ))}
        </ul>
        {/* TODO: Link to the Group creation flow once its destination is decided. */}
        <div className="mt-3" title="Create group coming soon">
          <Button
            type="button"
            variant="outline"
            aria-label="Create group"
            className={cn("h-9 w-full gap-2.5", expanded ? "justify-start px-2.5" : "px-0")}
            disabled
          >
            <Plus aria-hidden="true" />
            {expanded && "Create group"}
          </Button>
        </div>
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
