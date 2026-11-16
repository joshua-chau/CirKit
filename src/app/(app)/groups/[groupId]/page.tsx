import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { inviteMemberAction, leaveGroupAction } from "@/server/groups/group.actions";
import { getSharedItemsForGroup } from "@/server/groups/group-items";
import { getGroupDetail, getPendingGroupInvitations } from "@/server/groups/group.queries";
import { ActionButton } from "../_components/action-button";
import { InviteForm } from "../_components/invite-form";
import { PendingInvitations } from "../_components/pending-invitations";
import { SharedItemList } from "../_components/shared-item-list";

export const metadata: Metadata = { title: "Group · CirKit" };

type Props = { params: Promise<{ groupId: string }> };

export default function GroupPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <GroupContent params={params} />
    </Suspense>
  );
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

async function GroupContent({ params }: Props) {
  const { groupId } = await params;
  const user = await requireUser();

  let group;
  try {
    group = await getGroupDetail(groupId, user.id);
  } catch (error) {
    // Non-members get a 404 so they can't tell whether the group exists.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [invitations, items] = await Promise.all([
    group.viewer.canInvite ? getPendingGroupInvitations(groupId, user.id) : [],
    getSharedItemsForGroup(groupId, user.id),
  ]);
  const { viewer } = group;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link href="/groups" className="text-sm text-muted-foreground hover:text-foreground">
            ← All groups
          </Link>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          {group.description ? (
            <p className="max-w-2xl whitespace-pre-line text-muted-foreground">{group.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Created {dateFormat.format(group.createdAt)} · You are{" "}
            {viewer.role === "OWNER" ? "the owner" : "a member"}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {viewer.canManage ? (
            <Link href={`/groups/${group.id}/settings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Settings
            </Link>
          ) : null}
          <ActionButton
            action={leaveGroupAction.bind(null, group.id)}
            pendingLabel="Leaving…"
            confirmMessage={`Leave "${group.name}"? Your pending requests in this group will be declined and your items will stop being shared with it.`}
            variant="destructive"
          >
            Exit group
          </ActionButton>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Shared items</CardTitle>
          <CardDescription>
            {group.sharedItemCount === 0
              ? "No items are shared with this group yet."
              : `${group.sharedItemCount} ${group.sharedItemCount === 1 ? "item is" : "items are"} shared with this group.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SharedItemList items={items} viewerId={viewer.userId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({group.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ul className="divide-y">
            {group.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {member.name}
                    {member.id === viewer.userId ? (
                      <span className="font-normal text-muted-foreground"> (you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <span
                  className={
                    member.role === "OWNER"
                      ? "rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                      : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {member.role === "OWNER" ? "Owner" : "Member"}
                </span>
              </li>
            ))}
          </ul>

          {viewer.canInvite ? (
            <div className="grid gap-6 border-t pt-6">
              <InviteForm action={inviteMemberAction.bind(null, group.id)} />
              <PendingInvitations groupId={group.id} invitations={invitations} viewer={viewer} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
