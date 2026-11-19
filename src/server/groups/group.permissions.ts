import "server-only";

import type { GroupRole } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/** Either the default client or a transaction client. */
type Db = Pick<typeof prisma, "groupMember">;

/**
 * Who may invite new members. Decision (2026-11-15): any member.
 * Change this one function to make inviting owner-only.
 */
export function canInvite(role: GroupRole): boolean {
  return role === "OWNER" || role === "MEMBER";
}

/** Owners manage the group and its membership — never members' items. */
export function canManageGroup(role: GroupRole): boolean {
  return role === "OWNER";
}

/**
 * Returns the user's membership, or throws NotFoundError. Non-members get
 * "not found" (not "forbidden") so group existence is not leaked.
 */
export async function requireGroupMember(groupId: string, userId: string, db: Db = prisma) {
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new NotFoundError("Group not found.");
  }
  return membership;
}

/** Like requireGroupMember, but the user must be the Group Owner. */
export async function requireGroupOwner(groupId: string, userId: string, db: Db = prisma) {
  const membership = await requireGroupMember(groupId, userId, db);
  if (!canManageGroup(membership.role)) {
    throw new ForbiddenError("Only the group owner can do this.");
  }
  return membership;
}
