import "server-only";

import prisma from "@/lib/prisma";
import { NotFoundError } from "@/server/errors";
import { canInvite, canManageGroup, requireGroupMember } from "./group.permissions";

/** Groups the user belongs to, newest membership first. */
export async function getUserGroups(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      group: {
        select: { id: true, name: true, description: true, _count: { select: { members: true } } },
      },
    },
  });
  return memberships.map(({ role, group }) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group._count.members,
    role,
  }));
}

export type UserGroup = Awaited<ReturnType<typeof getUserGroups>>[number];

/**
 * Everything the group page needs. Throws NotFoundError for non-members.
 * `viewer` tells the UI which buttons to show; the actions re-check anyway.
 */
export async function getGroupDetail(groupId: string, userId: string) {
  const membership = await requireGroupMember(groupId, userId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      members: {
        // Owner first, then by join date.
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: {
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });
  if (!group) throw new NotFoundError("Group not found.");

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.createdAt,
    members: group.members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })),
    viewer: {
      userId,
      role: membership.role,
      canInvite: canInvite(membership.role),
      canManage: canManageGroup(membership.role),
    },
  };
}

export type GroupDetail = Awaited<ReturnType<typeof getGroupDetail>>;

/**
 * Pending, unexpired invitations of a group (members only). Includes the
 * token so members can copy the invite link until email sending exists.
 */
export async function getPendingGroupInvitations(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  return prisma.groupInvitation.findMany({
    where: { groupId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      token: true,
      expiresAt: true,
      invitedBy: { select: { id: true, name: true } },
    },
  });
}

export type PendingGroupInvitation = Awaited<ReturnType<typeof getPendingGroupInvitations>>[number];

/** Pending invitations addressed to an email (for the future dashboard). */
export async function getPendingInvitationsForEmail(email: string) {
  return prisma.groupInvitation.findMany({
    where: { email: email.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      token: true,
      expiresAt: true,
      group: { select: { id: true, name: true } },
      invitedBy: { select: { name: true } },
    },
  });
}

/**
 * Invitation shown on /invites/[token]. Anyone with the link may see the
 * group name; accepting still requires the invited email.
 */
export async function getInvitationByToken(token: string) {
  const invitation = await prisma.groupInvitation.findUnique({
    where: { token },
    select: {
      email: true,
      status: true,
      expiresAt: true,
      group: { select: { id: true, name: true, description: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!invitation) throw new NotFoundError("Invitation not found.");
  const expired = invitation.status === "PENDING" && invitation.expiresAt <= new Date();
  return { ...invitation, status: expired ? ("EXPIRED" as const) : invitation.status };
}

export type InvitationView = Awaited<ReturnType<typeof getInvitationByToken>>;
