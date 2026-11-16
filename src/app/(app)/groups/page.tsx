import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { createGroupAction } from "@/server/groups/group.actions";
import { getUserGroups } from "@/server/groups/group.queries";
import { GroupForm } from "./_components/group-form";

export const metadata: Metadata = { title: "Groups · CirKit" };

export default function GroupsPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="grid content-start gap-4">
        <h1 className="text-2xl font-semibold">Your groups</h1>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted" />}>
          <GroupList />
        </Suspense>
      </section>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Create a group</CardTitle>
          <CardDescription>You&apos;ll be its owner and can invite others.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupForm action={createGroupAction} submitLabel="Create group" pendingLabel="Creating…" />
        </CardContent>
      </Card>
    </div>
  );
}

async function GroupList() {
  const user = await requireUser();
  const groups = await getUserGroups(user.id);

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        You&apos;re not in any groups yet. Create one, or ask a member for an invite link.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {groups.map((group) => (
        <li key={group.id}>
          <Link
            href={`/groups/${group.id}`}
            className="block rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{group.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                {group.role === "OWNER" ? " · Owner" : ""}
              </span>
            </div>
            {group.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
