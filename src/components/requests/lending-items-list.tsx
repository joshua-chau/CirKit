"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loginUrlFor } from "@/lib/routes";
import {
  declineAllPendingItemRequests,
  fetchLendingItems,
  RequestApiError,
  submitLendingAction,
  type LendingAction,
} from "@/lib/requests/request-client";
import type { LendingItemResponse } from "@/lib/requests/request-types";

type OwnerAction = LendingAction | "decline-all";

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

/** Preserves the selected request when an API session has expired. */
function redirectToLogin(requestId: string): void {
  let destination = "/lending-items";

  if (requestId.length > 0) {
    const encodedRequestId = encodeURIComponent(requestId);
    destination += "?requestId=" + encodedRequestId;
  }

  const loginUrl = loginUrlFor(destination);

  window.location.assign(loginUrl);
}

export function LendingItemsList() {
  const searchParams = useSearchParams();
  const targetRequestId = searchParams.get("requestId") ?? "";

  const [requests, setRequests] = useState<LendingItemResponse[]>([]);
  const [loadVersion, setLoadVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Prevent two actions from starting before React updates the buttons.
  const actionInProgress = useRef(false);

  // Avoid moving focus again after every list refresh.
  const lastFocusedRequestId = useRef("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadRequests() {
      try {
        const records = await fetchLendingItems(controller.signal);

        if (!controller.signal.aborted) {
          setRequests(records);
          setLoadError("");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof RequestApiError && error.status === 401) {
          redirectToLogin(targetRequestId);
          return;
        }

        setLoadError("Could not load your received requests.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadRequests();

    return () => {
      controller.abort();
    };
  }, [loadVersion, targetRequestId]);

  useEffect(() => {
    if (targetRequestId.length === 0) {
      lastFocusedRequestId.current = "";
      return;
    }

    if (isLoading || loadError.length > 0) {
      return;
    }

    if (lastFocusedRequestId.current === targetRequestId) {
      return;
    }

    // The element is found only after its API record has been rendered.
    const elementId = "received-request-" + targetRequestId;
    const element = document.getElementById(elementId);

    if (element === null) {
      return;
    }

    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "center" });

    lastFocusedRequestId.current = targetRequestId;
  }, [requests, targetRequestId, isLoading, loadError]);

  function refreshRequests() {
    setLoadError("");
    setIsLoading(true);

    setLoadVersion((version) => {
      const nextVersion = version + 1;

      return nextVersion;
    });
  }

  async function handleAction(
    request: LendingItemResponse,
    action: OwnerAction,
  ) {
    if (actionInProgress.current) {
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
    setIsSubmitting(true);
    setActionError("");
    setSuccessMessage("");

    try {
      if (action === "decline-all") {
        const declinedCount = await declineAllPendingItemRequests(
          request.itemId,
        );

        const message =
          "Pending requests declined for this item: " + declinedCount + ".";

        setSuccessMessage(message);
      } else {
        await submitLendingAction(request.requestId, action);

        if (action === "approve") {
          setSuccessMessage(
            "Request approved. The item is borrowed, and its other " +
            "pending requests have been declined.",
          );
        } else {
          setSuccessMessage("Request declined.");
        }
      }

      refreshRequests();
    } catch (error) {
      if (error instanceof RequestApiError && error.status === 401) {
        redirectToLogin(targetRequestId);
        return;
      }

      if (error instanceof RequestApiError) {
        setActionError(error.message);

        if (error.status === 409) {
          refreshRequests();
        }
      } else {
        setActionError("Could not update the request. Try again.");
      }
    } finally {
      actionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  const actionsDisabled =
    isLoading || isSubmitting || loadError.length > 0;

  const showEmptyState =
    !isLoading && loadError.length === 0 && requests.length === 0;

  const targetExists = requests.some((request) => {
    const matchesTarget = request.requestId === targetRequestId;

    return matchesTarget;
  });

  const showMissingTarget =
    !isLoading &&
    loadError.length === 0 &&
    targetRequestId.length > 0 &&
    !targetExists;

  const list = (
    <div className="space-y-4" aria-busy={isLoading || isSubmitting}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Event times are shown in Toronto time.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading || isSubmitting}
          onClick={refreshRequests}
        >
          Refresh
        </Button>
      </div>

      {isLoading && <p role="status">Loading received requests…</p>}

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
