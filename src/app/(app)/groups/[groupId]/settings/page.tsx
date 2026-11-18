import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
  deleteGroupAction,
  removeMemberAction,
  transferOwnershipAction,
  updateGroupAction,
} from "@/server/groups/group.actions";
import { getGroupDetail } from "@/server/groups/group.queries";
import { ActionButton } from "../../_components/action-button";
import { GroupForm } from "../../_components/group-form";
import { GroupPictureEditor } from "../../_components/group-picture-editor";

export const metadata: Metadata = { title: "Group settings · CirKit" };

type Props = { params: Promise<{ groupId: string }> };

export default function GroupSettingsPage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}
    >
      <SettingsContent params={params} />
    </Suspense>
  );
}

/**
 * Group Owner only. Owners manage the group and its membership; this page
 * deliberately has nothing to do with members' items or borrow requests.
 */
async function SettingsContent({ params }: Props) {
  const { groupId } = await params;
  const user = await requireUser();

  let group;
  try {
    group = await getGroupDetail(groupId, user.id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  // Non-owners get a 404 too; every action re-checks ownership on the server.
  if (!group.viewer.canManage) notFound();

  const others = group.members.filter((m) => m.id !== user.id);

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/groups/${group.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to {group.name}
        </Link>
        <h1 className="text-2xl font-semibold">Group settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Picture</CardTitle>
          <CardDescription>
            Members see it next to the group name and in their group list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GroupPictureEditor
            groupId={group.id}
            groupName={group.name}
            image={group.image}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupForm
            action={updateGroupAction.bind(null, group.id)}
            defaultValues={{ name: group.name, description: group.description }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage members</CardTitle>
          <CardDescription>
            Removing a member declines their pending requests in this group and
            stops sharing their items here. It&apos;s blocked while they have an
            approved or ongoing borrow in this group.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are the only member.
            </p>
          ) : (
            <ul className="divide-y">
              {others.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <ActionButton
                      action={transferOwnershipAction.bind(
                        null,
                        group.id,
                        member.id,
                      )}
                      pendingLabel="Transferring…"
                      confirmMessage={`Make ${member.name} the owner? You will become a regular member and lose access to these settings.`}
                    >
                      Make owner
                    </ActionButton>
                    <ActionButton
                      action={removeMemberAction.bind(
                        null,
                        group.id,
                        member.id,
                      )}
                      pendingLabel="Removing…"
                      confirmMessage={`Remove ${member.name} from ${group.name}?`}
                      variant="destructive"
                    >
                      Remove
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle>Delete group</CardTitle>
          <CardDescription>
            Only possible when you are the last member and no items or borrow
            history are linked to the group. To leave a group with other
            members, make someone else the owner first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionButton
            action={deleteGroupAction.bind(null, group.id)}
            pendingLabel="Deleting…"
            confirmMessage={`Permanently delete "${group.name}"? This cannot be undone.`}
            variant="destructive"
            size="default"
          >
            Delete group
          </ActionButton>
        </CardContent>
      </Card>
    </div>
  );
}
