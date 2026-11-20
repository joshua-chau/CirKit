"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loginUrlFor } from "@/lib/routes";
import {
  approveRequestAction,
  declineAllPendingRequestsAction,
  declineRequestAction,
  type DeclineAllRequestsActionResult,
  type RequestActionResult,
} from "@/server/requests/request.actions";
import type { LendingItemResponse } from "@/lib/requests/request-types";

// Added: The Server Component owns the received request list.
type LendingItemsListProps = {
  requests: LendingItemResponse[];
  loadError: string;
};

type OwnerAction = "approve" | "decline" | "decline-all";

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Toronto",
  timeZoneName: "short",
});

/** Formats a calendar date without shifting it to another day. */
function formatRequestDate(value: string): string {
  const date = new Date(value + "T00:00:00Z");
  const formattedDate = calendarDateFormatter.format(date);

  return formattedDate;
}

/** Displays an actual event timestamp in Toronto's local time. */
function formatRequestTimestamp(value: string): string {
  const date = new Date(value);
  const formattedTimestamp = timestampFormatter.format(date);

  return formattedTimestamp;
}

/** Changed: Preserve the selected request when an Action session has expired. */
function redirectToLogin(requestId: string): void {
  let destination = "/lending-items";

  if (requestId.length > 0) {
    const encodedRequestId = encodeURIComponent(requestId);
    destination += "?requestId=" + encodedRequestId;
  }

  const loginUrl = loginUrlFor(destination);

  window.location.assign(loginUrl);
}

export function LendingItemsList({
  requests,
  loadError,
}: LendingItemsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetRequestId = searchParams.get("requestId") ?? "";

  // Changed: Keep only interaction state in the Client Component.
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Prevent two actions from starting before React updates the buttons.
  const actionInProgress = useRef(false);

  // Avoid moving focus again after every list refresh.
  const lastFocusedRequestId = useRef("");

  // Changed: Locate the target after server-provided records are rendered.
  useEffect(() => {
    if (targetRequestId.length === 0) {
      lastFocusedRequestId.current = "";
      return;
    }

    if (loadError.length > 0) {
      return;
    }

    if (lastFocusedRequestId.current === targetRequestId) {
      return;
    }

    // The element is found only after its server-provided record is rendered.
    const elementId = "received-request-" + targetRequestId;
    const element = document.getElementById(elementId);

    if (element === null) {
      return;
    }

    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "center" });

    lastFocusedRequestId.current = targetRequestId;
  }, [requests, targetRequestId, loadError]);

  // Changed: Refresh the server-rendered list.
  function refreshRequests(): void {
    if (isPending || actionInProgress.current) {
      return;
    }

    setActionError("");
    setSuccessMessage("");

    startTransition(() => {
      router.refresh();
    });
  }

  // Changed: Submit owner operations through Server Actions.
  function handleAction(
    request: LendingItemResponse,
    action: OwnerAction,
  ): void {
    if (isPending || actionInProgress.current) {
      return;
    }

    if (action === "approve") {
      const message =
        'Approve this request for "' + request.itemName +
        '"? The item will immediately be marked as borrowed. ' +
        "All other pending requests for this item, across all groups, " +
        "will be declined.";

      const confirmed = window.confirm(message);

      if (!confirmed) {
        return;
      }
    }

    if (action === "decline-all") {
      const message =
        'Decline every pending request for "' + request.itemName +
        '" across all groups?';

      const confirmed = window.confirm(message);

      if (!confirmed) {
        return;
      }
    }

    actionInProgress.current = true;
    setActionError("");
    setSuccessMessage("");

    startTransition(async () => {
      try {
        let result: RequestActionResult | DeclineAllRequestsActionResult;

        if (action === "approve") {
          result = await approveRequestAction(request.requestId);
        } else if (action === "decline") {
          result = await declineRequestAction(request.requestId);
        } else {
          result = await declineAllPendingRequestsAction(request.itemId);
        }

        if (!result.ok) {
          if (result.code === "UNAUTHENTICATED") {
            // Preserve the existing requestId when returning through login.
            redirectToLogin(targetRequestId);
            return;
          }

          setActionError(result.error);

          if (
            result.code === "CONFLICT" ||
            result.code === "NOT_FOUND"
          ) {
            router.refresh();
          }

          return;
        }

        if ("declinedCount" in result) {
          const message =
            "Pending requests declined for this item: " +
            result.declinedCount + ".";

          setSuccessMessage(message);
        } else if (action === "approve") {
          setSuccessMessage(
            "Request approved. The item is borrowed, and its other " +
            "pending requests have been declined.",
          );
        } else {
          setSuccessMessage("Request declined.");
        }

        // Successful Actions return refreshed server data through revalidation.
      } catch {
        setActionError(
          "Could not confirm the update. Refresh the list to check its status.",
        );
      } finally {
        actionInProgress.current = false;
      }
    });
  }

  // Changed: Use transition state instead of separate API loading flags.
  const hasLoadError = loadError.length > 0;
  const actionsDisabled = isPending || hasLoadError;

  const showEmptyState =
    !hasLoadError && requests.length === 0;

  const targetExists = requests.some((request) => {
    const matchesTarget = request.requestId === targetRequestId;

    return matchesTarget;
  });

  const showMissingTarget =
    !hasLoadError &&
    targetRequestId.length > 0 &&
    !targetExists;

  const list = (
    <div className="space-y-4" aria-busy={isPending}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Event times are shown in Toronto time.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={refreshRequests}
        >
          Refresh
        </Button>
      </div>

      {/* Changed: Show progress during an Action or server refresh. */}
      {isPending && <p role="status">Updating received requests…</p>}

      {loadError && <p role="alert">{loadError} Use Refresh to retry.</p>}

      {actionError && <p role="alert">{actionError}</p>}

      {successMessage && <p role="status">{successMessage}</p>}

      {showMissingTarget && (
        <p role="status">
          The selected request was not found in your received requests.
        </p>
      )}

      {showEmptyState && (
        <p className="text-muted-foreground">
          You haven’t received any requests for your items yet.
        </p>
      )}

      <ul className="space-y-4">
        {requests.map((request) => {
          const startDate = formatRequestDate(request.requestStartDate);
          const endDate = formatRequestDate(request.requestEndDate);
          const createdAt = formatRequestTimestamp(request.requestCreatedAt);
          const updatedAt = formatRequestTimestamp(request.requestUpdatedAt);

          let completedAt = "";

          if (request.requestCompletedAt !== null) {
            completedAt = formatRequestTimestamp(request.requestCompletedAt);
          }

          let entryClassName = "scroll-mt-6 rounded-xl";

          if (request.requestId === targetRequestId) {
            entryClassName += " ring-2 ring-primary ring-offset-2";
          }

          const entry = (
            <li
              key={request.requestId}
              id={"received-request-" + request.requestId}
              className={entryClassName}
              tabIndex={-1}
              aria-label={request.itemName + " — " + request.borrowerName}
            >
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0 space-y-1">
                      <h2 className="break-words text-lg font-medium">
                        {request.itemName}
                      </h2>
                      <p className="break-words">
                        Requested by {request.borrowerName}
                      </p>
                      <p className="break-words text-muted-foreground">
                        Group: {request.groupName}
                      </p>
                    </div>

                    <RequestStatusBadge status={request.requestStatus} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <div>
                      <dt className="text-muted-foreground">Start date</dt>
                      <dd>{startDate}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">End date</dt>
                      <dd>{endDate}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Submitted</dt>
                      <dd>{createdAt}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last updated</dt>
                      <dd>{updatedAt}</dd>
                    </div>
                    {completedAt && (
                      <div>
                        <dt className="text-muted-foreground">Returned</dt>
                        <dd>{completedAt}</dd>
                      </div>
                    )}
                  </dl>

                  {request.requestStatus === "PENDING" && (
                    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                      <Button
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => handleAction(request, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actionsDisabled}
                        onClick={() => handleAction(request, "decline")}
                      >
                        Decline
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={actionsDisabled}
                        onClick={() => handleAction(request, "decline-all")}
                      >
                        Decline all pending for this item
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );

          return entry;
        })}
      </ul>
    </div>
  );

  return list;
}
