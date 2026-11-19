import { Suspense } from "react";
import Link from "next/link";
import { Bell, Boxes, Package } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import prisma from "@/lib/prisma";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/routes";
import { requireUser } from "@/server/auth/session";

/**
 * Shell for logged-in pages (/dashboard, /groups/..., etc.).
 *
 * The layout's requireUser() is only for navigation. Layouts do not re-run on
 * every navigation, so each page/action under here must still call
 * requireUser() itself.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-muted/35 [font-family:var(--font-geist-sans)]">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-5">
        <Link
          href={DEFAULT_LOGIN_REDIRECT}
          aria-label="CirKit dashboard"
          className="flex items-center gap-2.5 rounded-lg text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-5" aria-hidden="true" />
          </span>
          CirKit
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/myitems"
            aria-label="My inventory"
            title="My inventory"
            className={buttonVariants({ variant: "ghost", size: "icon-lg" })}
          >
            <Package className="size-5" aria-hidden="true" />
          </Link>
          {/* TODO: Replace this placeholder with the SSE notification bell. */}
          <span title="Notifications coming soon">
            <Button type="button" variant="ghost" size="icon-lg" disabled aria-label="Notifications coming soon">
              <Bell className="size-5" aria-hidden="true" />
            </Button>
          </span>
          <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-muted" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <div className="flex flex-1">
        <Suspense fallback={<aside aria-hidden="true" className="w-52 shrink-0 border-r bg-sidebar" />}>
          <GroupsSidebar />
        </Suspense>
        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

async function AccountMenu() {
  const user = await requireUser();
  return <UserMenu name={user.name} image={user.image} />;
}

async function GroupsSidebar() {
  const user = await requireUser();
  const memberships = await prisma.groupMember.findMany({
    where: { userId: user.id },
    orderBy: { group: { name: "asc" } },
    select: { group: { select: { id: true, name: true } } },
  });

  return <AppSidebar groups={memberships.map(({ group }) => group)} />;
}
