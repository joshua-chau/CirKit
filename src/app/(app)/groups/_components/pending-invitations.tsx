import { revokeInvitationAction } from "@/server/groups/group.actions";
import type { GroupDetail, PendingGroupInvitation } from "@/server/groups/group.queries";
import { ActionButton } from "./action-button";
import { CopyLinkButton } from "./copy-link-button";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

type Props = {
  groupId: string;
  invitations: PendingGroupInvitation[];
  viewer: GroupDetail["viewer"];
};

/** Pending invites with their links; the sender or the owner can revoke. */
export function PendingInvitations({ groupId, invitations, viewer }: Props) {
  if (invitations.length === 0) return null;

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">Pending invitations</h3>
      <ul className="grid gap-3">
        {invitations.map((invitation) => {
          const canRevoke = viewer.canManage || invitation.invitedBy.id === viewer.userId;
          return (
            <li key={invitation.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited by {invitation.invitedBy.name} · expires{" "}
                    {dateFormat.format(invitation.expiresAt)}
                  </p>
                </div>
                {canRevoke ? (
                  <ActionButton
                    action={revokeInvitationAction.bind(null, groupId, invitation.id)}
                    pendingLabel="Revoking…"
                    confirmMessage={`Revoke the invitation for ${invitation.email}?`}
                    variant="ghost"
                  >
                    Revoke
                  </ActionButton>
                ) : null}
              </div>
              <CopyLinkButton path={`/invites/${invitation.token}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
