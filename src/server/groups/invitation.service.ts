import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { publishNotificationChanged } from "@/server/notifications/notification-events";
import { createGroupNotification } from "@/server/notifications/notification.service";
import { canInvite, canManageGroup, requireGroupMember } from "./group.permissions";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Invitations (including resends) one user may create per 24 hours. Every
 * invite can send an email from the app's Gmail account, so this stops a
 * member from using it to spam arbitrary addresses.
 */
export const DAILY_INVITE_LIMIT = 20;

type Invitee = { id: string; email: string };
type Tx = Prisma.TransactionClient;

/** Unguessable, URL-safe token (256 bits). */
function newToken() {
  return randomBytes(32).toString("base64url");
}

function sameEmail(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** What callers need to email an invitation. */
const invitationForEmail = {
  id: true,
  token: true,
  email: true,
  expiresAt: true,
  group: { select: { name: true } },
  invitedBy: { select: { name: true } },
} as const;

async function requireUnderDailyLimit(tx: Tx, inviterId: string) {
  const recent = await tx.groupInvitation.count({
    where: { invitedById: inviterId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
  });
  if (recent >= DAILY_INVITE_LIMIT) {
    throw new ConflictError(`You can send up to ${DAILY_INVITE_LIMIT} invitations a day. Try again tomorrow.`);
  }
}

/**
 * Invites an email address to the group. The caller emails the link (see
 * group.actions); members can also copy it from the pending list.
 */
export async function createInvitation(groupId: string, inviterId: string, email: string) {
  const { invitation, recipientId } = await prisma.$transaction(async (tx) => {
    // Serialize invites per group so a double-click can't create two.
    await tx.$queryRaw`SELECT "id" FROM "group" WHERE "id" = ${groupId} FOR UPDATE`;

    const membership = await requireGroupMember(groupId, inviterId, tx);
    if (!canInvite(membership.role)) {
      throw new ForbiddenError("You are not allowed to invite members to this group.");
    }

    const alreadyMember = await tx.groupMember.findFirst({
      where: { groupId, user: { email: { equals: email, mode: "insensitive" } } },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictError("This person is already a member.");

    // Mark stale invites as expired so the PENDING check below is accurate.
    await tx.groupInvitation.updateMany({
      where: { groupId, email, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });

    const pending = await tx.groupInvitation.findFirst({
      where: { groupId, email, status: "PENDING" },
      select: { id: true },
    });
    if (pending) throw new ConflictError("This email already has a pending invitation.");
    await requireUnderDailyLimit(tx, inviterId);

    const invitation = await tx.groupInvitation.create({
      data: {
        groupId,
        email,
        invitedById: inviterId,
        token: newToken(),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: invitationForEmail,
    });

    // Compare full emails ignoring case; "=" keeps "_" and "%" literal.
    // LIMIT 2 detects case variants allowed by the case-sensitive unique email index.
    const matchingUsers = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "user"
      WHERE LOWER("email") = LOWER(${email.trim()})
      LIMIT 2
    `;
    const hasUniqueRecipient = matchingUsers.length === 1;
    const recipientId = hasUniqueRecipient ? matchingUsers[0].id : null;
    if (recipientId) {
      await createGroupNotification(tx, {
        recipientId,
        type: NotificationType.GROUP_INVITED,
        groupId,
      });
    }

    return { invitation, recipientId };
  });

  if (recipientId) publishNotificationChanged(recipientId);
  return invitation;
}

/**
 * Resends a pending (or expired) invitation: the old link stops working and
 * a fresh one with a new 7-day expiry is created for the same email. Same
 * permission as revoking; counts toward the daily limit.
 */
export async function resendInvitation(groupId: string, userId: string, invitationId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "group" WHERE "id" = ${groupId} FOR UPDATE`;
    const membership = await requireGroupMember(groupId, userId, tx);
    const invitation = await tx.groupInvitation.findFirst({ where: { id: invitationId, groupId } });
    if (!invitation) throw new NotFoundError("Invitation not found.");
    if (invitation.invitedById !== userId && !canManageGroup(membership.role)) {
      throw new ForbiddenError("Only the person who sent the invitation or the owner can resend it.");
    }
    if (invitation.status !== "PENDING" && invitation.status !== "EXPIRED") {
      throw new ConflictError(`This invitation is already ${invitation.status.toLowerCase()}.`);
    }
    const alreadyMember = await tx.groupMember.findFirst({
      where: { groupId, user: { email: { equals: invitation.email, mode: "insensitive" } } },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictError("This person is already a member.");
    await requireUnderDailyLimit(tx, userId);

    await tx.groupInvitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });
    return tx.groupInvitation.create({
      data: {
        groupId,
        email: invitation.email,
        invitedById: userId,
        token: newToken(),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: invitationForEmail,
    });
  });
}

/**
 * Accepts an invitation for the logged-in user and returns the group id.
 * The invitation must be PENDING, unexpired and addressed to the user's
 * email. Idempotent: accepting twice (double-click) just returns the group.
 */
export async function acceptInvitation(token: string, user: Invitee) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "group_invitation" WHERE "token" = ${token} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError("Invitation not found.");

    const invitation = await tx.groupInvitation.findUniqueOrThrow({ where: { token } });
    if (!sameEmail(invitation.email, user.email)) {
      throw new ForbiddenError(
        `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
      );
    }

    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: invitation.groupId, userId: user.id } },
      select: { id: true },
    });

    if (invitation.status === "ACCEPTED" && existing) return invitation.groupId;
    if (invitation.status !== "PENDING") {
      throw new ConflictError(`This invitation is no longer valid (${invitation.status.toLowerCase()}).`);
    }
    if (invitation.expiresAt <= new Date()) {
      throw new ConflictError("This invitation has expired. Ask a member to invite you again.");
    }

    if (!existing) {
      await tx.groupMember.create({
        data: { groupId: invitation.groupId, userId: user.id, role: "MEMBER" },
      });
    }
    await tx.groupInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });
    return invitation.groupId;
  });
}

/** The invitee declines. Idempotent. */
export async function declineInvitation(token: string, user: Invitee) {
  const invitation = await prisma.groupInvitation.findUnique({ where: { token } });
  if (!invitation) throw new NotFoundError("Invitation not found.");
  if (!sameEmail(invitation.email, user.email)) {
    throw new ForbiddenError("This invitation was sent to a different email address.");
  }
  if (invitation.status === "DECLINED") return;
  if (invitation.status !== "PENDING") {
    throw new ConflictError(`This invitation is no longer valid (${invitation.status.toLowerCase()}).`);
  }
  await prisma.groupInvitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "DECLINED" },
  });
}

/** Withdraw a pending invitation: the member who sent it, or the owner. */
export async function revokeInvitation(groupId: string, userId: string, invitationId: string) {
  const membership = await requireGroupMember(groupId, userId);
  const invitation = await prisma.groupInvitation.findFirst({
    where: { id: invitationId, groupId },
  });
  if (!invitation) throw new NotFoundError("Invitation not found.");
  if (invitation.invitedById !== userId && !canManageGroup(membership.role)) {
    throw new ForbiddenError("Only the person who sent the invitation or the owner can revoke it.");
  }
  if (invitation.status === "REVOKED") return;
  if (invitation.status !== "PENDING") {
    throw new ConflictError(`This invitation is already ${invitation.status.toLowerCase()}.`);
  }
  await prisma.groupInvitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
}
