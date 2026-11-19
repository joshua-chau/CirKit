import { Suspense } from "react";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar } from "@/components/avatar";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/routes";
import { requireUser } from "@/server/auth/session";

/**
 * Shell for logged-in pages (/dashboard, /groups/..., etc.).
 *
 * The layout's requireUser() is only for the header. Layouts do not re-run on
 * every navigation, so each page/action under here must still call
 * requireUser() itself.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-5">
            <Link href={DEFAULT_LOGIN_REDIRECT} className="font-semibold">
              CirKit
            </Link>
            <Link
              href="/groups"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Groups
            </Link>
          </nav>
          <Suspense
            fallback={
              <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
            }
          >
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-full text-sm text-muted-foreground hover:text-foreground"
        aria-label="Your profile"
      >
        <Avatar src={user.image ?? null} name={user.name} size="xs" />
        <span className="hidden sm:inline">{user.name}</span>
      </Link>
      <SignOutButton />
    </div>
  );
}
