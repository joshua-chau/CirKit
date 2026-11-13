import "server-only";

import type {
  Item,
  Request as RequestRecord,
} from "@/generated/prisma/client";
import {
  ItemStatus,
  RequestStatus,
} from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { RequestError } from "@/lib/requests/request-errors";
import type {
  ValidatedCreateRequestInput,
} from "@/lib/requests/request-types";

/**
 * Service layer for the planned request CRUD architecture.
 *
 * Expected Create Request flow:
 * 1. POST /api/requests is handled by a route.ts Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller validates the JSON body with validateCreateRequestInput().
 * 4. The Controller passes the authenticated user ID and validated input here.
 * 5. This Service checks business permissions and writes through Prisma.
 * 6. The Controller serializes the returned record and creates the HTTP response.
 *
 * This Service does not read cookies, parse JSON, or create HTTP responses.
 */

/**
 * Creates a PENDING request without changing the item's AVAILABLE status.
 *
 * Preconditions:
 * - currentUserId comes from server-side authentication.
 * - input has passed validateCreateRequestInput().
 *
 * Concurrency convention:
 * - Operations affecting requests or availability for the same item must first
 *   lock that Item row within their transaction.
 * - Approval, archiving, and access revocation must follow this convention.
 * - The database lock is released when the transaction finishes.
 */
export async function createRequest(
  currentUserId: string,
  input: ValidatedCreateRequestInput,
): Promise<RequestRecord> {
  const createdRequest = await prisma.$transaction(
    async (transaction) => {
      // Tagged SQL binds itemId as a parameter rather than SQL text.
      // Lock the item before checking availability or creating a request.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${input.itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      const item = items[0];

      // The source group must exist.
      const group = await transaction.group.findUnique({
        where: {
          id: input.groupId,
        },
        select: {
          id: true,
        },
      });

      if (group === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The selected group was not found.",
        );
      }

      // Both MEMBER and OWNER roles may borrow another member's item.
      const membership = await transaction.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: input.groupId,
            userId: currentUserId,
          },
        },
      });

      if (membership === null) {
        throw new RequestError(
          "FORBIDDEN",
          "You must belong to this group to request an item.",
        );
      }

      // An item shared with another group is not accessible through this group.
      const itemAccess = await transaction.itemAccess.findUnique({
        where: {
          itemId_groupId: {
            itemId: input.itemId,
            groupId: input.groupId,
          },
        },
      });

      if (itemAccess === null) {
        throw new RequestError(
          "FORBIDDEN",
          "This item is not shared with the selected group.",
        );
      }

      // Item ownership is separate from the user's group role.
      if (item.ownerId === currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "You cannot request your own item.",
        );
      }

      if (item.itemArchivedAt !== null) {
        throw new RequestError(
          "CONFLICT",
          "This item has been archived.",
        );
      }

      if (item.itemStatus === ItemStatus.BORROWED) {
        throw new RequestError(
          "CONFLICT",
          "This item is already borrowed.",
        );
      }

      // Set the borrower and initial status on the server.
      // Multiple PENDING requests for the same item are allowed.
      const request = await transaction.request.create({
        data: {
          itemId: input.itemId,
          borrowerId: currentUserId,
          groupId: input.groupId,
          requestStartDate: input.requestStartDate,
          requestEndDate: input.requestEndDate,
          requestStatus: RequestStatus.PENDING,
        },
      });

      return request;
    },
  );

  return createdRequest;
}

/**
 * Lists requests submitted by the authenticated user across all groups.
 * Includes pending, approved, declined, cancelled, and completed requests.
 *
 * Expected Read Request flow:
 * 1. GET /api/requests/my-request is handled by a route.ts Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID to this Service.
 * 4. The Controller serializes the returned records into API responses.
 *
 * currentUserId must come from authentication, not a client-supplied user ID.
 * Item archiving or access revocation does not remove request history.
 */
export async function getMyRequests(
  currentUserId: string,
): Promise<RequestRecord[]> {
  const requests = await prisma.request.findMany({
    where: {
      borrowerId: currentUserId,
    },
    orderBy: [
      {
        requestCreatedAt: "desc",
      },
      {
        // Use a deterministic order when creation timestamps are equal.
        requestId: "desc",
      },
    ],
  });

  return requests;
}

/**
 * Lists all requests received for an item owned by the authenticated user.
 * Includes requests from every source group and all request statuses.
 *
 * Expected Read Request flow:
 * 1. GET /api/items/[itemId]/requests is handled by a route.ts Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's itemId here.
 * 4. This Service verifies item ownership before returning request records.
 * 5. The Controller serializes the records into API responses.
 *
 * Group ownership does not grant permission to manage another user's item.
 * Archived items and revoked group access do not hide request history.
 */
export async function getItemRequests(
  currentUserId: string,
  itemId: string,
): Promise<RequestRecord[]> {
  const item = await prisma.item.findUnique({
    where: {
      itemId: itemId,
    },
    select: {
      ownerId: true,
    },
  });

  if (item === null) {
    throw new RequestError(
      "NOT_FOUND",
      "The requested item was not found.",
    );
  }

  if (item.ownerId !== currentUserId) {
    throw new RequestError(
      "FORBIDDEN",
      "Only the item owner can view its received requests.",
    );
  }

  const requests = await prisma.request.findMany({
    where: {
      itemId: itemId,
    },
    orderBy: [
      {
        requestCreatedAt: "desc",
      },
      {
        // Use a deterministic order when creation timestamps are equal.
        requestId: "desc",
      },
    ],
  });

  return requests;
}

/**
 * Approves one pending request and immediately treats the item as borrowed.
 *
 * Expected Update Request flow:
 * 1. POST /api/requests/[requestId]/approve is handled by a Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's requestId here.
 * 4. This Service checks ownership and current database state.
 * 5. Approval, rejection of other pending requests, and the item status update
 *    are committed together.
 *
 * All operations for the same item must follow the Item row-lock convention.
 * No separate handover confirmation or pickup-date restriction is applied.
 */
export async function approveRequest(
  currentUserId: string,
  requestId: string,
): Promise<RequestRecord> {
  const approvedRequest = await prisma.$transaction(
    async (transaction) => {
      // First locate the item associated with this request.
      const requestReference = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
        select: {
          itemId: true,
        },
      });

      if (requestReference === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      // Lock the Item before reading the request's actionable state.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${requestReference.itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      const item = items[0];

      // Group ownership does not grant approval permission.
      if (item.ownerId !== currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "Only the item owner can approve its requests.",
        );
      }

      // Another operation may have finished while this transaction waited.
      // Read the request again after acquiring the Item lock.
      const request = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
      });

      if (request === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      if (request.requestStatus !== RequestStatus.PENDING) {
        throw new RequestError(
          "CONFLICT",
          "This request is no longer pending.",
        );
      }

      if (item.itemArchivedAt !== null) {
        throw new RequestError(
          "CONFLICT",
          "This item has been archived.",
        );
      }

      if (item.itemStatus === ItemStatus.BORROWED) {
        throw new RequestError(
          "CONFLICT",
          "This item is already borrowed.",
        );
      }

      // Do not approve a request through a group with revoked item access.
      const itemAccess = await transaction.itemAccess.findUnique({
        where: {
          itemId_groupId: {
            itemId: item.itemId,
            groupId: request.groupId,
          },
        },
      });

      if (itemAccess === null) {
        throw new RequestError(
          "FORBIDDEN",
          "This item is no longer shared with the request's source group.",
        );
      }

      const updatedRequest = await transaction.request.update({
        where: {
          requestId: requestId,
        },
        data: {
          requestStatus: RequestStatus.APPROVED,
        },
      });

      // Reject all other pending requests across every source group.
      // Date overlap is not considered in the simplified first version.
      await transaction.request.updateMany({
        where: {
          itemId: item.itemId,
          requestId: {
            not: requestId,
          },
          requestStatus: RequestStatus.PENDING,
        },
        data: {
          requestStatus: RequestStatus.DECLINED,
        },
      });

      await transaction.item.update({
        where: {
          itemId: item.itemId,
        },
        data: {
          itemStatus: ItemStatus.BORROWED,
        },
      });

      return updatedRequest;
    },
  );

  return approvedRequest;
}

/**
 * Declines one pending request without changing the item or other requests.
 *
 * Expected Update Request flow:
 * 1. POST /api/requests/[requestId]/decline is handled by a Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's requestId here.
 * 4. This Service verifies item ownership and the current request status.
 * 5. The Controller serializes the updated request into an API response.
 *
 * The Item row is locked before checking the actionable request state,
 * following the same concurrency convention as creation and approval.
 */
export async function declineRequest(
  currentUserId: string,
  requestId: string,
): Promise<RequestRecord> {
  const declinedRequest = await prisma.$transaction(
    async (transaction) => {
      // Locate the item associated with this request.
      const requestReference = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
        select: {
          itemId: true,
        },
      });

      if (requestReference === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      // Serialize operations affecting requests for the same item.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${requestReference.itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      const item = items[0];

      if (item.ownerId !== currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "Only the item owner can decline its requests.",
        );
      }

      // Read the latest status after acquiring the Item lock.
      const request = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
      });

      if (request === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      if (request.requestStatus !== RequestStatus.PENDING) {
        throw new RequestError(
          "CONFLICT",
          "This request is no longer pending.",
        );
      }

      // Declining does not require the item to remain available or shared.
      // Only this request is updated; the item and other requests are untouched.
      const updatedRequest = await transaction.request.update({
        where: {
          requestId: requestId,
        },
        data: {
          requestStatus: RequestStatus.DECLINED,
        },
      });

      return updatedRequest;
    },
  );

  return declinedRequest;
}

/**
 * Declines all current PENDING requests for an item across every source group.
 * Returns the number of requests changed.
 *
 * Expected Update Request flow:
 * 1. POST /api/items/[itemId]/requests/decline-all is handled by a Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's itemId here.
 * 4. This Service verifies ownership and updates only PENDING requests.
 * 5. The Controller returns the declined count in its HTTP response.
 *
 * The Item row-lock convention coordinates this operation with creation,
 * approval, and single-request decline operations.
 * The item and requests in other statuses remain unchanged.
 */
export async function declineAllPendingRequests(
  currentUserId: string,
  itemId: string,
): Promise<number> {
  const declinedCount = await prisma.$transaction(
    async (transaction) => {
      // Lock the item before checking ownership and updating its requests.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      const item = items[0];

      if (item.ownerId !== currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "Only the item owner can decline its requests.",
        );
      }

      // Do not filter by group: every current Pending request is included.
      const result = await transaction.request.updateMany({
        where: {
          itemId: itemId,
          requestStatus: RequestStatus.PENDING,
        },
        data: {
          requestStatus: RequestStatus.DECLINED,
        },
      });

      // Zero matches is a successful operation, not a missing-record error.
      const count = result.count;

      return count;
    },
  );

  return declinedCount;
}

/**
 * Cancels one PENDING request submitted by the authenticated borrower.
 *
 * Expected Update Request flow:
 * 1. POST /api/requests/[requestId]/cancel is handled by a Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's requestId here.
 * 4. This Service verifies borrower identity and the current request status.
 * 5. The Controller serializes the updated request into an API response.
 *
 * Only PENDING requests can be cancelled.
 * The item and other requests remain unchanged.
 */
export async function cancelRequest(
  currentUserId: string,
  requestId: string,
): Promise<RequestRecord> {
  const cancelledRequest = await prisma.$transaction(
    async (transaction) => {
      const requestReference = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
        select: {
          itemId: true,
        },
      });

      if (requestReference === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      // Follow the shared Item row-lock convention.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${requestReference.itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      // Re-read the request after waiting for the Item lock.
      const request = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
      });

      if (request === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      if (request.borrowerId !== currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "Only the borrower can cancel this request.",
        );
      }

      if (request.requestStatus !== RequestStatus.PENDING) {
        throw new RequestError(
          "CONFLICT",
          "Only pending requests can be cancelled.",
        );
      }

      // Cancellation does not require current group access or availability.
      const updatedRequest = await transaction.request.update({
        where: {
          requestId: requestId,
        },
        data: {
          requestStatus: RequestStatus.CANCELLED,
        },
      });

      return updatedRequest;
    },
  );

  return cancelledRequest;
}

/**
 * Completes an APPROVED request and makes its item AVAILABLE.
 *
 * Expected Update Request flow:
 * 1. POST /api/requests/[requestId]/return is handled by a Controller.
 * 2. The Controller obtains the authenticated user through requireUser().
 * 3. The Controller passes that user's ID and the route's requestId here.
 * 4. This Service verifies the borrower and current request/item states.
 * 5. Request completion and the item status update are committed together.
 *
 * Clicking Return immediately counts as a completed return.
 * No owner confirmation, handover confirmation, or date restriction is applied.
 * Previously declined requests are not restored.
 */
export async function returnItem(
  currentUserId: string,
  requestId: string,
): Promise<RequestRecord> {
  const completedRequest = await prisma.$transaction(
    async (transaction) => {
      const requestReference = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
        select: {
          itemId: true,
        },
      });

      if (requestReference === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      // Lock the item before checking states or completing the return.
      const items = await transaction.$queryRaw<Item[]>`
        SELECT *
        FROM "Item"
        WHERE "itemId" = ${requestReference.itemId}
        FOR UPDATE
      `;

      if (items.length === 0) {
        throw new RequestError(
          "NOT_FOUND",
          "The requested item was not found.",
        );
      }

      const item = items[0];

      // Re-read the request after waiting for the Item lock.
      const request = await transaction.request.findUnique({
        where: {
          requestId: requestId,
        },
      });

      if (request === null) {
        throw new RequestError(
          "NOT_FOUND",
          "The request was not found.",
        );
      }

      if (request.borrowerId !== currentUserId) {
        throw new RequestError(
          "FORBIDDEN",
          "Only the borrower can return this item.",
        );
      }

      if (request.requestStatus !== RequestStatus.APPROVED) {
        throw new RequestError(
          "CONFLICT",
          "Only approved requests can be completed by returning the item.",
        );
      }

      if (item.itemStatus !== ItemStatus.BORROWED) {
        throw new RequestError(
          "CONFLICT",
          "This item is not currently borrowed.",
        );
      }

      const completedAt = new Date();

      // Group access is not required to return an already borrowed item.
      const updatedRequest = await transaction.request.update({
        where: {
          requestId: requestId,
        },
        data: {
          requestStatus: RequestStatus.COMPLETED,
          requestCompletedAt: completedAt,
        },
      });

      await transaction.item.update({
        where: {
          itemId: item.itemId,
        },
        data: {
          itemStatus: ItemStatus.AVAILABLE,
        },
      });

      return updatedRequest;
    },
  );

  return completedRequest;
}
