"use client";

import { useEffect, useState } from "react";

import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loginUrlFor } from "@/lib/routes";
import {
  fetchBorrowingItems,
  RequestApiError,
  submitBorrowingAction,
  type BorrowingAction,
} from "@/lib/requests/request-client";
import type { BorrowingItemResponse } from "@/lib/requests/request-types";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatRequestDate(value: string) {
  // The API sends calendar dates. Format them without shifting the day.
  const date = new Date(value + "T00:00:00Z");
  const formattedDate = dateFormatter.format(date);

  return formattedDate;
}



// Defining the components status
export function BorrowingItemsList() {
  const [requests, setRequests] = useState<BorrowingItemResponse[]>([]);
  const [loadVersion, setLoadVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadRequests() {
      try {
        const records = await fetchBorrowingItems(controller.signal);

        if (!controller.signal.aborted) {
          setRequests(records);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof RequestApiError && error.status === 401) {
          const loginUrl = loginUrlFor("/borrowing-items");
          window.location.assign(loginUrl);
          return;
        }

        setLoadError("Could not load your borrowing items.");
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
  }, [loadVersion]);

  function refreshRequests() {
    setLoadError("");
    setIsLoading(true);
    setLoadVersion((version) => version + 1);
  }

  async function handleAction(requestId: string, action: BorrowingAction) {
    setIsSubmitting(true);
    setActionError("");

    try {
      await submitBorrowingAction(requestId, action);
      refreshRequests();
    } catch (error) {
      if (error instanceof RequestApiError && error.status === 401) {
        const loginUrl = loginUrlFor("/borrowing-items");
        window.location.assign(loginUrl);
        return;
      }

      if (error instanceof RequestApiError) {
        setActionError(error.message);

        if (error.status === 409) {
          refreshRequests();
        }
      } else {
        setActionError("Could not update this request. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const actionsDisabled = isLoading || isSubmitting || loadError.length > 0;
  const showEmptyState = !isLoading && !loadError && requests.length === 0;

  const list = (
    <div className="space-y-4" aria-busy={isLoading || isSubmitting}>
      {isLoading && <p role="status">Loading borrowing items…</p>}

      {loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert">{loadError}</p>
          <Button type="button" variant="outline" onClick={refreshRequests}>
            Try again
          </Button>
        </div>
      )}

      {actionError && <p role="alert">{actionError}</p>}

      {showEmptyState && (
        <p className="text-muted-foreground">You haven’t requested any items yet.</p>
      )}

      <ul className="space-y-3">
        {requests.map((request) => {
          const startDate = formatRequestDate(request.requestStartDate);
          const endDate = formatRequestDate(request.requestEndDate);
          let dateLabel = startDate;

          if (request.requestStartDate !== request.requestEndDate) {
            dateLabel = startDate + " – " + endDate;
          }

          const row = (
            <li key={request.requestId}>
              <Card>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h2 className="break-words font-medium">{request.itemName}</h2>
                    <p className="break-words text-muted-foreground">{request.groupName}</p>
                    <p className="text-muted-foreground">{dateLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RequestStatusBadge status={request.requestStatus} />
                    {request.requestStatus === "PENDING" && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actionsDisabled}
                        onClick={() => handleAction(request.requestId, "cancel")}
                      >
                        Cancel request
                      </Button>
                    )}
                    {request.requestStatus === "APPROVED" && (
                      <Button
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => handleAction(request.requestId, "return")}
                      >
                        Return
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );

          return row;
        })}
      </ul>
    </div>
  );

  return list;
}
