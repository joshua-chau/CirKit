import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { acceptInvitationAction, declineInvitationAction } from "@/server/groups/group.actions";
import { getInvitationByToken } from "@/server/groups/group.queries";
import { ActionButton } from "../../groups/_components/action-button";

export const metadata: Metadata = { title: "Group invitation · CirKit" };

type Props = { params: Promise<{ token: string }> };

export default function InvitePage({ params }: Props) {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <InviteContent params={params} />
      </Suspense>
    </div>
  );
}

async function InviteContent({ params }: Props) {
  const { token } = await params;
  // proxy.ts sends logged-out visitors to /login?redirect=/invites/<token>,
  // so they come back here after signing in.
  const user = await requireUser();

  let invitation;
  try {
    invitation = await getInvitationByToken(token);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const forThisUser = invitation.email.toLowerCase() === user.email.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join {invitation.group.name}</CardTitle>
        <CardDescription>
          {invitation.invitedBy.name} invited {invitation.email} to this group.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {invitation.group.description ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{invitation.group.description}</p>
        ) : null}

        {invitation.status === "ACCEPTED" ? (
          <p className="text-sm">
            This invitation has already been accepted.{" "}
            {forThisUser ? (
              <Link href={`/groups/${invitation.group.id}`} className="underline underline-offset-4">
                Go to the group
              </Link>
            ) : null}
          </p>
        ) : invitation.status !== "PENDING" ? (
          <p className="text-sm text-muted-foreground">
            This invitation is {invitation.status.toLowerCase()}. Ask a group member for a new one.
          </p>
        ) : !forThisUser ? (
          <p className="text-sm text-destructive">
            You are signed in as {user.email}. Sign out and sign in as {invitation.email} to accept.
          </p>
        ) : (
          <div className="flex gap-2">
            <ActionButton
              action={acceptInvitationAction.bind(null, token)}
              pendingLabel="Joining…"
              variant="default"
              size="default"
            >
              Accept invitation
            </ActionButton>
            <ActionButton
              action={declineInvitationAction.bind(null, token)}
              pendingLabel="Declining…"
              confirmMessage="Decline this invitation?"
              size="default"
            >
              Decline
            </ActionButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
