"use server";

import "server-only";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { groupInputSchema, inviteInputSchema } from "@/lib/validation/group.schema";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/auth.schema";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { createGroup, deleteGroup, leaveGroup, removeMember, transferOwnership, updateGroup } from "./group.service";
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
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

export async function inviteMemberAction(
  groupId: string,
  _prev: ActionResult<{ invitePath: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ invitePath: string }>> {
  const user = await requireUser();
  if (!id.safeParse(groupId).success) return invalid();
  const parsed = inviteInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error) };
  }
  const result = await run(() => createInvitation(groupId, user.id, parsed.data.email));
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: { invitePath: `/invites/${result.data.token}` } };
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
