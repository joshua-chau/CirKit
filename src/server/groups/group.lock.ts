import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/server/errors";

type Tx = Prisma.TransactionClient;

/**
 * Locks the group row for the rest of the transaction, so two membership
 * changes on one group (e.g. transfer + leave) cannot interleave.
 * Note: "group" is an SQL keyword, hence the quotes.
 */
export async function lockGroup(tx: Tx, groupId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "group" WHERE "id" = ${groupId} FOR UPDATE
  `;
  if (rows.length === 0) throw new NotFoundError("Group not found.");
}
