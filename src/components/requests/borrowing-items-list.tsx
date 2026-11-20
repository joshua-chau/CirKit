"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  cancelRequestAction,
  returnRequestAction,
  type RequestActionResult,
} from "@/server/requests/request.actions";
import type { BorrowingItemResponse } from "@/lib/requests/request-types";

// Added: The Server Component owns the list data.
type BorrowingItemsListProps = {
  requests: BorrowingItemResponse[];
  loadError: string;
};

type BorrowingAction = "cancel" | "return";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatRequestDate(value: string) {
  // Preserve calendar dates without shifting the borrowing day.
  const date = new Date(value + "T00:00:00Z");
  const formattedDate = dateFormatter.format(date);

  return formattedDate;
}
export function BorrowingItemsList({
  requests,
  loadError,
}: BorrowingItemsListProps) {
  const router = useRouter();

  // Changed: Keep interaction state locally, but render requests from props.
  const [actionError, setActionError] = useState("");
  const [isPending, startTransition] = useTransition();
  const actionInProgress = useRef(false);

  // Changed: Reload the Server Component instead of calling the list API.
  function refreshRequests(): void {
    if (isPending || actionInProgress.current) {
      return;
    }

    setActionError("");

    startTransition(() => {
      router.refresh();
    });
  }

  // Changed: Invoke Server Actions instead of posting to Request API routes.
  function handleAction(
    requestId: string,
    action: BorrowingAction,
  ): void {
    if (isPending || actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setActionError("");

    startTransition(async () => {
      try {
        let result: RequestActionResult;

        if (action === "cancel") {
          result = await cancelRequestAction(requestId);
        } else {
          result = await returnRequestAction(requestId);
        }

        if (!result.ok) {
          setActionError(result.error);

          // Added: Reload stale records after a state conflict or missing request.
          if (
            result.code === "CONFLICT" ||
            result.code === "NOT_FOUND"
          ) {
            router.refresh();
          }
        }

        // Successful Actions revalidate this page and return updated server data.
      } catch {
        setActionError(
          "Could not confirm the update. Refresh the list to check its status.",
        );
      } finally {
        actionInProgress.current = false;
      }
    });
  }

  const hasLoadError = loadError.length > 0;
  const actionsDisabled = isPending || hasLoadError;
  const showEmptyState = !hasLoadError && requests.length === 0;

  const list = (
    <div className="space-y-4" aria-busy={isPending}>
      {isPending && <p role="status">Updating borrowing items…</p>}

      {hasLoadError && <p role="alert">{loadError}</p>}

      {actionError && <p role="alert">{actionError}</p>}

      {/* Added: Refresh server data without maintaining another client list. */}
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={refreshRequests}
      >
        Refresh requests
      </Button>

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
