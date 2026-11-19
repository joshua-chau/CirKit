"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RequestResponse } from "@/lib/requests/request-types";

type ReceivedRequest = RequestResponse & { borrowerName: string; groupName: string };
const labels: Record<RequestResponse["requestStatus"], string> = {
  PENDING: "Pending", APPROVED: "Lent out", DECLINED: "Declined", CANCELLED: "Cancelled", COMPLETED: "Completed",
};
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});
function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function ItemRequests({ itemId }: { itemId: string }) {
  const [requests, setRequests] = useState<ReceivedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/requests`, {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Unable to load requests.");
        if (!Array.isArray(result.data)) throw new Error("The server returned an unexpected response.");
        if (!controller.signal.aborted) setRequests(result.data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load requests.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId, attempt]);

  return (
    <section aria-label="Received requests" aria-busy={loading} className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Received requests</h2>
        <Button variant="outline" disabled={loading} onClick={() => {
          setError(null); setLoading(true); setAttempt(value => value + 1);
        }}>Refresh requests</Button>
      </div>
      {loading ? <p role="status" className="mt-4">Loading requests...</p>
        : error ? <p role="alert" className="mt-4 text-destructive">{error}</p>
        : requests.length === 0 ? <p className="mt-4 text-muted-foreground">No requests for this item yet.</p>
        : <ul className="mt-4 space-y-3">
          {requests.map((request) => {
            // Use this request's ID to locate its entry on the Lending Items page.
            const encodedRequestId = encodeURIComponent(request.requestId);
            const requestUrl = "/lending-items?requestId=" + encodedRequestId;

            const startDate = formatDate(request.requestStartDate);
            const endDate = formatDate(request.requestEndDate);
            const statusLabel = labels[request.requestStatus];

            const entry = (
              <li
                key={request.requestId}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="break-words font-medium">
                    {request.borrowerName}
                  </h3>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                    {statusLabel}
                  </span>
                </div>

                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {request.groupName}
                </p>

                <p className="mt-1 text-sm">
                  {startDate} – {endDate}
                </p>

                <Link
                  href={requestUrl}
                  scroll={false}
                  className="mt-3 inline-block rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  View request
                </Link>
              </li>
            );

            return entry;
          })}
        </ul>}
    </section>
  );
}
