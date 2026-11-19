import "server-only";

import prisma from "@/lib/prisma";
import { deleteImage, readImage, uploadImage } from "@/lib/storage";
import { NotFoundError } from "@/server/errors";

/**
 * Profile pictures. `user.image` is Better Auth's field and is always a URL
 * the browser can load: either a Google/GitHub picture URL, or, for uploads,
 * our own /api/users/{id}/image?key=<R2 key>. The route only ever reads the
 * key stored in the database, never one from the request, so the key in the
 * URL is just how we remember which R2 object belongs to the user.
 */

const KEY_PARAM = "key";

function profileImageUrl(userId: string, objectKey: string) {
  return `/api/users/${encodeURIComponent(userId)}/image?${KEY_PARAM}=${encodeURIComponent(objectKey)}`;
}

/** The R2 key inside a stored `user.image`, or null for external/no picture. */
export function storedImageKey(
  userId: string,
  image: string | null,
): string | null {
  if (!image) return null;
  const prefix = `/api/users/${encodeURIComponent(userId)}/image?`;
  if (!image.startsWith(prefix)) return null;
  const key = new URLSearchParams(image.slice(prefix.length)).get(KEY_PARAM);
  return key && key.startsWith("users/") ? key : null;
}

async function cleanup(key: string) {
  try {
    await deleteImage(key);
  } catch (error) {
    console.error(
      "Profile image cleanup failed; retry deletion for key:",
      key,
      error,
    );
  }
}

/** Swaps the user's picture in one locked step; returns the previous value. */
async function swapImage(userId: string, image: string | null) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ image: string | null }[]>`
      SELECT "image" FROM "user" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundError("User not found.");
    await tx.user.update({ where: { id: userId }, data: { image } });
    return rows[0].image;
  });
}

/** Uploads a new profile picture for the signed-in user. Returns its URL. */
export async function setProfileImage(userId: string, file: File) {
  const { objectKey } = await uploadImage({
    source: { kind: "users", id: userId },
    file,
  });
  const url = profileImageUrl(userId, objectKey);
  let previous: string | null;
  try {
    previous = await swapImage(userId, url);
  } catch (error) {
    await cleanup(objectKey);
    throw error;
  }
  const oldKey = storedImageKey(userId, previous);
  if (oldKey) await cleanup(oldKey);
  return url;
}

/**
 * Removes the profile picture. Also clears a Google/GitHub picture; it won't
 * come back on the next sign-in (Better Auth doesn't overwrite user info).
 */
export async function removeProfileImage(userId: string) {
  const previous = await swapImage(userId, null);
  const oldKey = storedImageKey(userId, previous);
  if (oldKey) await cleanup(oldKey);
}

/**
 * Reads an uploaded profile picture. Visible to the user and to anyone who
 * shares a group with them; everyone else gets 404.
 */
export async function getProfileImage(userId: string, viewerId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      OR: [
        { id: viewerId },
        {
          groupMemberships: {
            some: { group: { members: { some: { userId: viewerId } } } },
          },
        },
      ],
    },
    select: { image: true },
  });
  const key = user ? storedImageKey(userId, user.image) : null;
  if (!key) throw new NotFoundError("Picture not found.");
  return readImage(key);
}
