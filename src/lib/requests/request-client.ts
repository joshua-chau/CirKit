import type { BorrowingItemResponse } from "@/lib/requests/request-types";

export type BorrowingAction = "cancel" | "return";

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
