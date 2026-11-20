"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import {
  RequestError,
  type RequestErrorCode,
} from "@/lib/requests/request-errors";
import {
  approveRequest,
  cancelRequest,
  createRequest,
  declineAllPendingRequests,
  declineRequest,
  returnItem,
} from "@/lib/requests/request-service";
import { validateCreateRequestInput } from "@/lib/requests/request-validation";
import { getCurrentUser, requireUser } from "@/server/auth/session";

// Changed: Include an expired session in the shared action failure result.
type RequestActionFailure = {
  ok: false;
  code: RequestErrorCode | "UNAUTHENTICATED";
  error: string;
};

export type RequestActionResult =
  | {
      ok: true;
    }
  | RequestActionFailure;

// Added: Batch decline returns the actual number of updated requests.
export type DeclineAllRequestsActionResult =
  | {
      ok: true;
      declinedCount: number;
    }
  | RequestActionFailure;

type BorrowerAction = "cancel" | "return";
type OwnerRequestAction = "approve" | "decline";

/**
 * Changed: Share page revalidation between borrower and owner operations.
 * Revalidation does not push updates into another user's open browser.
 */
function revalidateRequestPages(itemId: string): void {
  const encodedItemId = encodeURIComponent(itemId);
  const itemPath = "/myitems/" + encodedItemId;

  revalidatePath("/borrowing-items");
  revalidatePath("/lending-items");
  // Added: Dashboard summaries also depend on request status changes.
  revalidatePath("/dashboard");
  revalidatePath("/myitems");
  revalidatePath(itemPath);

  // Approval and return change availability in every sharing group.
  revalidatePath("/groups/[groupId]", "page");
}

/**
 * Added: Handle shared authentication, validation, and error translation.
 * The existing Services retain ownership checks, transactions, and row locks.
 */
async function runBorrowerAction(
  requestId: string,
  action: BorrowerAction,
): Promise<RequestActionResult> {
  const user = await requireUser();

  if (typeof requestId !== "string") {
    const result: RequestActionResult = {
      ok: false,
      code: "INVALID_INPUT",
      error: "A request ID is required.",
    };

    return result;
  }

  const validatedRequestId = requestId.trim();

  if (validatedRequestId.length === 0) {
    const result: RequestActionResult = {
      ok: false,
      code: "INVALID_INPUT",
      error: "A request ID is required.",
    };

    return result;
  }

  try {
    let itemId: string;

    if (action === "cancel") {
      const cancelledRequest = await cancelRequest(
        user.id,
        validatedRequestId,
      );

      itemId = cancelledRequest.itemId;
    } else {
      const completedRequest = await returnItem(
        user.id,
        validatedRequestId,
      );

      itemId = completedRequest.itemId;
    }

    revalidateRequestPages(itemId);
  } catch (error) {
    if (error instanceof RequestError) {
      const result: RequestActionResult = {
        ok: false,
        code: error.code,
        error: error.message,
      };

      return result;
    }

    // Preserve unexpected errors for server-side error handling.
    throw error;
  }

  const result: RequestActionResult = {
    ok: true,
  };

  return result;
}

/**
 * Added: Cancel a PENDING request through a Server Action.
 */
export async function cancelRequestAction(
  requestId: string,
): Promise<RequestActionResult> {
  const result = await runBorrowerAction(requestId, "cancel");

  return result;
}

/**
 * Added: Complete an APPROVED request through a Server Action.
 */
export async function returnRequestAction(
  requestId: string,
): Promise<RequestActionResult> {
  const result = await runBorrowerAction(requestId, "return");

  return result;
}

/**
 * Added: Validate identifiers received by owner Server Actions.
 */
function validateActionId(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " is required.",
    );
  }

  const validatedId = value.trim();

  if (validatedId.length === 0) {
    throw new RequestError(
      "INVALID_INPUT",
      fieldName + " is required.",
    );
  }

  return validatedId;
}

/**
 * Added: Translate expected business errors without hiding system errors.
 */
function createActionFailure(error: unknown): RequestActionFailure {
  if (error instanceof RequestError) {
    const result: RequestActionFailure = {
      ok: false,
      code: error.code,
      error: error.message,
    };

    return result;
  }

  throw error;
}

/**
 * Added: Authenticate the owner and delegate a single-request operation.
 * Ownership, current status, and database locking remain in the Services.
 */
async function runOwnerRequestAction(
  requestId: string,
  action: OwnerRequestAction,
): Promise<RequestActionResult> {
  const user = await getCurrentUser();

  if (user === null) {
    const result: RequestActionFailure = {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "Please sign in to continue.",
    };

    return result;
  }

  try {
    const validatedRequestId = validateActionId(requestId, "Request ID");
    let itemId: string;

    if (action === "approve") {
      const approvedRequest = await approveRequest(
        user.id,
        validatedRequestId,
      );

      itemId = approvedRequest.itemId;
    } else {
      const declinedRequest = await declineRequest(
        user.id,
        validatedRequestId,
      );

      itemId = declinedRequest.itemId;
    }

    // Added: Approval also changes other requests and the item's status.
    revalidateRequestPages(itemId);
  } catch (error) {
    const result = createActionFailure(error);

    return result;
  }

  const result: RequestActionResult = {
    ok: true,
  };

  return result;
}

export async function approveRequestAction(
  requestId: string,
): Promise<RequestActionResult> {
  const result = await runOwnerRequestAction(requestId, "approve");

  return result;
}

export async function declineRequestAction(
  requestId: string,
): Promise<RequestActionResult> {
  const result = await runOwnerRequestAction(requestId, "decline");

  return result;
}

/**
 * Added: Decline all pending requests for an item across every source group.
 */
export async function declineAllPendingRequestsAction(
  itemId: string,
): Promise<DeclineAllRequestsActionResult> {
  const user = await getCurrentUser();

  if (user === null) {
    const result: RequestActionFailure = {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "Please sign in to continue.",
    };

    return result;
  }

  try {
    const validatedItemId = validateActionId(itemId, "Item ID");
    const declinedCount = await declineAllPendingRequests(
      user.id,
      validatedItemId,
    );

    revalidateRequestPages(validatedItemId);

    const result: DeclineAllRequestsActionResult = {
      ok: true,
      declinedCount: declinedCount,
    };

    return result;
  } catch (error) {
    const result = createActionFailure(error);

    return result;
  }
}

/** Added: Convert technical field names into readable form messages. */
function formatCreateRequestError(message: string): string {
  const formattedMessage = message
    .replaceAll("requestStartDate", "Start date")
    .replaceAll("requestEndDate", "End date");

  return formattedMessage;
}

/**
 * Added: Create a request from the group date form in the Request module.
 * The Service verifies membership, item access, ownership, and availability.
 */
export async function createRequestAction(
  groupId: string,
  itemId: string,
  _previousState: RequestActionResult | null,
  formData: FormData,
): Promise<RequestActionResult> {
  const user = await requireUser();

  try {
    if (!(formData instanceof FormData)) {
      throw new RequestError("INVALID_INPUT", "Provide a valid request form.");
    }

    const startDate = formData.get("requestStartDate");
    const endDate = formData.get("requestEndDate");
    const rawInput = {
      itemId: itemId,
      groupId: groupId,
      requestStartDate: startDate,
      requestEndDate: endDate,
    };
    const input = validateCreateRequestInput(rawInput);
    const createdRequest = await createRequest(user.id, input);

    revalidateRequestPages(createdRequest.itemId);
  } catch (error) {
    const failure = createActionFailure(error);
    const message = formatCreateRequestError(failure.error);
    const result: RequestActionResult = {
      ...failure,
      error: message,
    };

    return result;
  }

  const result: RequestActionResult = { ok: true };

  return result;
}
