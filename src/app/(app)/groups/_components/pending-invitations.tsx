import { resendInvitationAction, revokeInvitationAction } from "@/server/groups/group.actions";
import type { GroupDetail, PendingGroupInvitation } from "@/server/groups/group.queries";
import { ActionButton } from "./action-button";
import { CopyLinkButton } from "./copy-link-button";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

type Props = {
  groupId: string;
  invitations: PendingGroupInvitation[];
  viewer: GroupDetail["viewer"];
};

/** Pending invites with their links; the sender or the owner can resend or revoke. */
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
                  <div className="flex items-start gap-1">
                    <ActionButton
                      action={resendInvitationAction.bind(null, groupId, invitation.id)}
                      pendingLabel="Sending…"
                      confirmMessage={`Send ${invitation.email} a new invitation email? The current link will stop working.`}
                      variant="ghost"
                      successToastTitle="Invitation resent"
                    >
                      Resend
                    </ActionButton>
                    <ActionButton
                      action={revokeInvitationAction.bind(null, groupId, invitation.id)}
                      pendingLabel="Revoking…"
                      confirmMessage={`Revoke the invitation for ${invitation.email}?`}
                      variant="ghost"
                    >
                      Revoke
                    </ActionButton>
                  </div>
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
