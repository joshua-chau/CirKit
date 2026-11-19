import type {
  BorrowingItemResponse,
  LendingItemResponse,
} from "@/lib/requests/request-types";

export type BorrowingAction = "cancel" | "return";

// Actions performed by the item owner on one pending request.
export type LendingAction = "approve" | "decline";

export class RequestApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestApiError";
  }
}

async function checkRequestResponse(response: Response, fallback: string) {
  if (response.ok) {
    return;
  }

  let message = fallback;

  try {
    const body: { error?: { message?: string } } = await response.json();
    const errorMessage = body?.error?.message;

    if (typeof errorMessage === "string" && errorMessage.length > 0) {
      message = errorMessage;
    }
  } catch {
    // Keep the fallback when the server does not return a JSON error.
  }

  throw new RequestApiError(response.status, message);
}

export async function fetchBorrowingItems(signal: AbortSignal) {
  const response = await fetch("/api/requests/my-request", { signal });
  await checkRequestResponse(response, "Could not load your borrowing items.");

  const body: { data: BorrowingItemResponse[] } = await response.json();
  const requests = body.data;

  return requests;
}

export async function submitBorrowingAction(
  requestId: string,
  action: BorrowingAction,
) {
  const encodedRequestId = encodeURIComponent(requestId);
  const path = "/api/requests/" + encodedRequestId + "/" + action;
  const response = await fetch(path, { method: "POST" });

  await checkRequestResponse(response, "Could not update this request.");
}

/**
 * Loads requests received for the authenticated user's own items.
 * The signal lets the component cancel loading when it unmounts.
 */
export async function fetchLendingItems(
  signal: AbortSignal,
): Promise<LendingItemResponse[]> {
  const response = await fetch("/api/requests/received-requests", {
    signal: signal,
  });

  await checkRequestResponse(
    response,
    "Could not load your received requests.",
  );

  const body: { data: LendingItemResponse[] } = await response.json();
  const requests = body.data;

  return requests;
}

/**
 * Approves or declines one pending request.
 * The backend verifies ownership and the current request status.
 * After success, the component must reload the list because approval
 * also declines other pending requests for the same item.
 */
export async function submitLendingAction(
  requestId: string,
  action: LendingAction,
): Promise<void> {
  const encodedRequestId = encodeURIComponent(requestId);
  const path = "/api/requests/" + encodedRequestId + "/" + action;

  const response = await fetch(path, {
    method: "POST",
  });

  await checkRequestResponse(
    response,
    "Could not update this request.",
  );
}

/**
 * Declines every pending request for one item across all source groups.
 * Approved and historical requests are not changed.
 * Returns the number of requests declined by this operation.
 */
export async function declineAllPendingItemRequests(
  itemId: string,
): Promise<number> {
  const encodedItemId = encodeURIComponent(itemId);
  const path = "/api/items/" + encodedItemId + "/requests/decline-all";

  const response = await fetch(path, {
    method: "POST",
  });

  await checkRequestResponse(
    response,
    "Could not decline the pending requests for this item.",
  );

  const body: { data: { declinedCount: number } } = await response.json();
  const declinedCount = body.data.declinedCount;

  return declinedCount;
}
