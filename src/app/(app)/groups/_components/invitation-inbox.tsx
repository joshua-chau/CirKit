import { acceptInvitationAction, declineInvitationAction } from "@/server/groups/group.actions";
import type { InboxInvitation } from "@/server/groups/group.queries";
import { ActionButton } from "./action-button";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Invitations sent to the signed-in user, with Accept / Decline. */
export function InvitationInbox({ invitations }: { invitations: InboxInvitation[] }) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="inbox-heading" className="grid gap-3">
      <h2 id="inbox-heading" className="text-lg font-semibold">
        Invitations ({invitations.length})
      </h2>
      <ul className="grid gap-3">
        {invitations.map((invitation) => (
          <li
            key={invitation.token}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4"
          >
            <div className="min-w-0">
              <p className="font-medium">{invitation.group.name}</p>
              <p className="text-xs text-muted-foreground">
                {invitation.invitedBy.name} invited you · {invitation.group._count.members}{" "}
                {invitation.group._count.members === 1 ? "member" : "members"} · expires{" "}
                {dateFormat.format(invitation.expiresAt)}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ActionButton
                action={acceptInvitationAction.bind(null, invitation.token)}
                pendingLabel="Joining…"
                variant="default"
              >
                Accept
              </ActionButton>
              <ActionButton
                action={declineInvitationAction.bind(null, invitation.token)}
                pendingLabel="Declining…"
                confirmMessage={`Decline the invitation to ${invitation.group.name}?`}
              >
                Decline
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
