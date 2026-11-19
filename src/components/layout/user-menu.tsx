"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@base-ui/react/avatar";
import { Popover } from "@base-ui/react/popover";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";

export function UserMenu({ name, image }: { name: string; image?: string | null }) {
  const [open, setOpen] = useState(false);
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Open account menu"
        className="grid size-9 place-items-center rounded-full bg-muted text-sm font-semibold ring-offset-2 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar.Root className="grid size-full place-items-center overflow-hidden rounded-full">
          {image && <Avatar.Image src={image} alt="" className="size-full object-cover" />}
          <Avatar.Fallback>{initial}</Avatar.Fallback>
        </Avatar.Root>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} className="z-20">
          <Popover.Popup className="w-56 space-y-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg [font-family:var(--font-geist-sans)]">
            <Popover.Title className="break-words text-sm font-semibold">{name}</Popover.Title>
            <div className="grid gap-2 border-t pt-3">
              <Link
                href="/profile"
                className={buttonVariants({ variant: "outline" })}
                onNavigate={() => setOpen(false)}
              >
                View profile
              </Link>
              <SignOutButton />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
