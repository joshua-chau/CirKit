"use server";

import "server-only";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { groupInputSchema, inviteInputSchema } from "@/lib/validation/group.schema";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/auth.schema";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { sendInvitationEmail, type InvitationEmailStatus } from "@/server/email/invitation-email";
import { createGroup, deleteGroup, leaveGroup, removeMember, transferOwnership, updateGroup } from "./group.service";
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  resendInvitation,
  revokeInvitation,
} from "./invitation.service";

// Every Server Action is a public POST endpoint: each one re-checks the
// session (requireUser), validates its arguments, and lets the service
// enforce membership/ownership. Hiding buttons in the UI is only cosmetic.

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

const id = z.string().min(1).max(200);

/** Runs a service call, turning domain errors into `{ ok: false }`. */
async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error; // includes redirect()/notFound() signals and real bugs
  }
}

function invalid(): { ok: false; error: string } {
  return { ok: false, error: "Invalid request." };
}

// ---------------------------------------------------------------- groups

export async function createGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = groupInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error) };
  }
  const group = await createGroup(user.id, parsed.data);
  refresh();
  redirect(`/groups/${group.id}`);
}

export async function updateGroupAction(
  groupId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success) return invalid();
  const parsed = groupInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error) };
  }
  const result = await run(() => updateGroup(groupId, user.id, parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success) return invalid();
  const result = await run(() => deleteGroup(groupId, user.id));
  if (!result.ok) return result;
  refresh();
  redirect("/groups");
}

// --------------------------------------------------------------- members

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success) return invalid();
  const result = await run(() => leaveGroup(groupId, user.id));
  if (!result.ok) return result;
  refresh();
  redirect("/groups");
}

export async function removeMemberAction(groupId: string, memberUserId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success || !id.safeParse(memberUserId).success) return invalid();
  const result = await run(() => removeMember(groupId, user.id, memberUserId));
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

export async function transferOwnershipAction(groupId: string, newOwnerUserId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success || !id.safeParse(newOwnerUserId).success) return invalid();
  const result = await run(() => transferOwnership(groupId, user.id, newOwnerUserId));
  if (!result.ok) return result;
  // The settings page is owner-only, so send the former owner back to the group.
  redirect(`/groups/${groupId}`);
}

// ----------------------------------------------------------- invitations

export type InviteResult = { invitePath: string; email: InvitationEmailStatus };

/** Emails a just-created invitation; never fails the action. */
function emailInvitation(invitation: Awaited<ReturnType<typeof createInvitation>>) {
  return sendInvitationEmail({
    to: invitation.email,
    token: invitation.token,
    groupName: invitation.group.name,
    inviterName: invitation.invitedBy.name,
    expiresAt: invitation.expiresAt,
  });
}

export async function inviteMemberAction(
  groupId: string,
  _prev: ActionResult<InviteResult> | null,
  formData: FormData,
): Promise<ActionResult<InviteResult>> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success) return invalid();
  const parsed = inviteInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error) };
  }
  const result = await run(() => createInvitation(groupId, user.id, parsed.data.email));
  if (!result.ok) return result;
  const email = await emailInvitation(result.data);
  refresh();
  return { ok: true, data: { invitePath: `/invites/${result.data.token}`, email } };
}

export async function resendInvitationAction(
  groupId: string,
  invitationId: string,
): Promise<ActionResult<{ message: string }>> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success || !id.safeParse(invitationId).success) return invalid();
  const result = await run(() => resendInvitation(groupId, user.id, invitationId));
  if (!result.ok) return result;
  const email = await emailInvitation(result.data);
  refresh();
  const message =
    email === "sent"
      ? "Email sent with a new link."
      : email === "not_configured"
        ? "New link created. Email isn't set up, so copy the link below."
        : "New link created, but the email couldn't be sent. Copy the link below.";
  return { ok: true, data: { message } };
}

export async function revokeInvitationAction(groupId: string, invitationId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success || !id.safeParse(invitationId).success) return invalid();
  const result = await run(() => revokeInvitation(groupId, user.id, invitationId));
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(token).success) return invalid();
  const result = await run(() => acceptInvitation(token, user));
  if (!result.ok) return result;
  refresh();
  redirect(`/groups/${result.data}`);
}

export async function declineInvitationAction(token: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!id.safeParse(token).success) return invalid();
  const result = await run(() => declineInvitation(token, user));
  if (!result.ok) return result;
  redirect("/groups");
}

// Changed: Item sharing now belongs to src/server/items/item.actions.ts.
// Changed: Request creation now belongs to src/server/requests/request.actions.ts.
