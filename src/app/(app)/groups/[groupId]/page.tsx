import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import {
  inviteMemberAction,
  leaveGroupAction,
} from "@/server/groups/group.actions";
// Changed: Delegate item sharing to the Item module's Server Action.
import { shareItemWithGroupAction } from "@/server/items/item.actions";
import {
  getListableItems,
  getSharedItemsForGroup,
} from "@/server/groups/group-items";
import {
  getGroupDetail,
  getPendingGroupInvitations,
} from "@/server/groups/group.queries";
import { ActionButton } from "../_components/action-button";
import { Avatar } from "@/components/avatar";
import { InviteForm } from "../_components/invite-form";
import { ListItemForm } from "../_components/list-item-form";
import { PendingInvitations } from "../_components/pending-invitations";
import { SharedItemList } from "../_components/shared-item-list";
import { ItemFilters } from "@/components/items/item-filters";
import { ItemValidationError, validateItemFilters } from "@/lib/items/item-validation";
import type { ItemFilters as Filters } from "@/lib/items/item-types";

export const metadata: Metadata = { title: "Group · CirKit" };

type Props = {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function GroupPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}
    >
      <GroupContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

async function GroupContent({ params, searchParams }: Props) {
  const { groupId } = await params;
  const user = await requireUser();

  let group;
  let invitations;
  let items;
  let listable;
  try {
    group = await getGroupDetail(groupId, user.id);
    [invitations, items] = await Promise.all([
      group.viewer.canInvite ? getPendingGroupInvitations(groupId, user.id) : [],
      getSharedItemsForGroup(groupId, user.id),
    ]);
    listable = await getListableItems(user.id, items);
  } catch (error) {
    // Missing groups and lost membership both return to the user's own groups.
    if (error instanceof NotFoundError) redirect("/groups");
    throw error;
  }
  let filters: Filters = {};
  let filterError: string | null = null;
  try {
    filters = validateItemFilters(await searchParams);
  } catch (error) {
    if (!(error instanceof ItemValidationError)) throw error;
    filterError = error.message;
  }
  const hasFilters = Object.values(filters).some(Boolean);
  const [invitations, items, listable] = await Promise.all([
    group.viewer.canInvite ? getPendingGroupInvitations(groupId, user.id) : [],
    filterError ? Promise.resolve([]) : getSharedItemsForGroup(groupId, user.id, filters),
    getListableItems(user.id, groupId),
  ]);
  const { viewer } = group;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link
            href="/groups"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← All groups
          </Link>
          <div className="flex items-center gap-3">
            <Avatar src={group.image} name={group.name} size="md" />
            <h1 className="text-2xl font-semibold">{group.name}</h1>
          </div>
          {group.description ? (
            <p className="max-w-2xl whitespace-pre-line text-muted-foreground">
              {group.description}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Created {dateFormat.format(group.createdAt)} · You are{" "}
            {viewer.role === "OWNER" ? "the owner" : "a member"}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {viewer.canManage ? (
            <Link
              href={`/groups/${group.id}/settings`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Settings
            </Link>
          ) : null}
          <ActionButton
            action={leaveGroupAction.bind(null, group.id)}
            pendingLabel="Leaving…"
            errorToastTitle="Couldn’t leave group"
            confirmMessage={`Leave "${group.name}"? Your pending borrowing requests will be cancelled, pending requests for your items will be declined, and your items will stop being shared with this group.`}
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
            {filterError ? "Choose valid item filters to view shared items."
              : hasFilters ? `${items.length} matching ${items.length === 1 ? "item" : "items"} in this group.`
              : items.length === 0
              ? "No items are shared with this group yet."
              : `${items.length} ${items.length === 1 ? "item is" : "items are"} shared with this group.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ItemFilters filters={filters} />
          {filterError ? <p role="alert" className="text-sm text-destructive">{filterError}</p> : <SharedItemList
            groupId={group.id}
            items={items}
            viewerId={viewer.userId}
            filtered={hasFilters}
          />}
          <div className={items.length > 0 ? "border-t pt-4" : undefined}>
            <ListItemForm
              action={shareItemWithGroupAction.bind(null, group.id)}
              items={listable.items}
              hasItems={listable.hasItems}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({group.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ul className="divide-y">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={member.image} name={member.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.name}
                      {member.id === viewer.userId ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (you)
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
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
              <PendingInvitations
                groupId={group.id}
                invitations={invitations}
                viewer={viewer}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
