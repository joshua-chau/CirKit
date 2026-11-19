import "server-only";

import prisma from "@/lib/prisma";

/** Whether the user has an email + password login (vs. only Google/GitHub). */
export async function hasPassword(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  return account !== null;
}

/** Which sign-in methods the user has, for the profile page. */
export async function getSignInMethods(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { providerId: true },
  });
  return accounts.map((account) => account.providerId);
}
