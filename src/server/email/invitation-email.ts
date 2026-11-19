import "server-only";

import { EmailNotConfiguredError, EmailSendError, sendEmail } from "./gmail";

export type InvitationEmailStatus = "sent" | "not_configured" | "failed";

type Invitation = {
  to: string;
  token: string;
  groupName: string;
  inviterName: string;
  expiresAt: Date;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function appUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function invitationLink(token: string) {
  return `${appUrl()}/invites/${encodeURIComponent(token)}`;
}

export function renderInvitationEmail(invite: Invitation) {
  const link = invitationLink(invite.token);
  const expires = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(invite.expiresAt);
  const subject = `${invite.inviterName} invited you to join ${invite.groupName} on CirKit`;

  const text = [
    `${invite.inviterName} invited you to join "${invite.groupName}" on CirKit, where group members share and borrow everyday items.`,
    "",
    `Accept or decline the invitation here: ${link}`,
    "",
    `Sign in or create an account with this email address (${invite.to}) to accept. The link expires on ${expires}.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  const g = escapeHtml(invite.groupName);
  const n = escapeHtml(invite.inviterName);
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <tr><td>
      <p style="margin:0 0 4px;font-size:14px;color:#666">CirKit</p>
      <h1 style="margin:0 0 16px;font-size:22px">Join ${g}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">
        <strong>${n}</strong> invited you to join <strong>${g}</strong>, a group on CirKit where members share and borrow everyday items.
      </p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">View invitation</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5">
        Sign in or create an account with <strong>${escapeHtml(invite.to)}</strong> to accept. The link expires on ${escapeHtml(expires)}.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#666;word-break:break-all">Or paste this link into your browser: ${escapeHtml(link)}</p>
      <p style="margin:16px 0 0;font-size:12px;color:#999">If you weren't expecting this, you can ignore this email.</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

/**
 * Emails an invitation. Never throws: the invitation already exists, and the
 * inviter can always fall back to copying the link.
 */
export async function sendInvitationEmail(invite: Invitation): Promise<InvitationEmailStatus> {
  try {
    await sendEmail({ to: invite.to, ...renderInvitationEmail(invite) });
    return "sent";
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) return "not_configured";
    if (error instanceof EmailSendError) {
      console.error(`Invitation email to group "${invite.groupName}" not sent: ${error.message}`);
      return "failed";
    }
    console.error("Unexpected error sending invitation email:", error);
    return "failed";
  }
}
