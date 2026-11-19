import "server-only";

import prisma from "@/lib/prisma";
import { deleteImage, readImage, uploadImage } from "@/lib/storage";
import { NotFoundError } from "@/server/errors";
import { requireGroupOwner } from "./group.permissions";
import { lockGroup } from "./group.lock";

/**
 * Group pictures, following the item picture design: the file lives in
 * private R2 storage, `group.image` holds its object key, and browsers load
 * it through GET /api/groups/{id}/image, which checks who may see it.
 */

/**
 * The URL pages and APIs hand out for a group picture, or null. `v` changes
 * whenever the picture is replaced, so browsers never show a stale one.
 */
export function groupImageUrl(
  groupId: string,
  imageKey: string | null,
): string | null {
  if (!imageKey) return null;
  const version = imageKey.slice(imageKey.lastIndexOf("/") + 1);
  return `/api/groups/${encodeURIComponent(groupId)}/image?v=${encodeURIComponent(version)}`;
}

/** Deletes a replaced/removed picture. Failures are logged, not thrown. */
export async function cleanupGroupImage(key: string) {
  try {
    await deleteImage(key);
  } catch (error) {
    console.error(
      "Group image cleanup failed; retry deletion for key:",
      key,
      error,
    );
  }
}

/** Uploads a new group picture (owner only). Returns its URL. */
export async function setGroupImage(
  groupId: string,
  userId: string,
  file: File,
) {
  // Check before uploading so non-owners can't put files in the bucket.
  await requireGroupOwner(groupId, userId);
  const { objectKey } = await uploadImage({
    source: { kind: "groups", id: groupId },
    file,
  });

  let oldKey: string | null;
  try {
    oldKey = await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      await requireGroupOwner(groupId, userId, tx); // ownership may have changed meanwhile
      const before = await tx.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { image: true },
      });
      await tx.group.update({
        where: { id: groupId },
        data: { image: objectKey },
      });
      return before.image;
    });
  } catch (error) {
    await cleanupGroupImage(objectKey);
    throw error;
  }
  if (oldKey) await cleanupGroupImage(oldKey);
  return groupImageUrl(groupId, objectKey);
}

/** Removes the group picture (owner only). Removing twice is fine. */
export async function removeGroupImage(groupId: string, userId: string) {
  const oldKey = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await requireGroupOwner(groupId, userId, tx);
    const before = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { image: true },
    });
    if (before.image)
      await tx.group.update({ where: { id: groupId }, data: { image: null } });
    return before.image;
  });
  if (oldKey) await cleanupGroupImage(oldKey);
}

/**
 * Reads a group picture for a viewer. Allowed for members, and for people
 * with a pending invitation (so the picture shows in their inbox).
 */
export async function getGroupImage(
  groupId: string,
  viewer: { id: string; email: string },
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      image: true,
      members: { where: { userId: viewer.id }, select: { id: true }, take: 1 },
      invitations: {
        where: {
          email: { equals: viewer.email, mode: "insensitive" },
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  // Same answer for "no such group" and "not yours to see".
  if (
    !group ||
    (group.members.length === 0 && group.invitations.length === 0)
  ) {
    throw new NotFoundError("Group not found.");
  }
  if (!group.image) throw new NotFoundError("This group has no picture.");
  return readImage(group.image);
}
