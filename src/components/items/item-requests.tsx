import Link from "next/link";
import { ItemRefreshButton } from "@/components/items/item-refresh-button";
import type { RequestResponse } from "@/lib/requests/request-types";

export type ReceivedItemRequest = RequestResponse & {
  borrowerName: string;
  groupName: string;
};

const labels: Record<RequestResponse["requestStatus"], string> = {
  PENDING: "Pending",
  APPROVED: "Lent out",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};
const formatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

/** Render owner-scoped records. A null list means the history could not load. */
export function ItemRequests({ requests }: { requests: ReceivedItemRequest[] | null }) {
  const section = (
    <section aria-label="Received requests" className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Received requests</h2>
        <ItemRefreshButton label="Refresh requests" />
      </div>
      {requests === null && <p role="alert" className="mt-4 text-sm text-destructive">Unable to load requests.</p>}
      {requests?.length === 0 && <p className="mt-4 text-muted-foreground">No requests for this item yet.</p>}
      <ul className="mt-4 space-y-3">
        {requests?.map((request) => {
          const requestPath = "/lending-items?requestId=" + encodeURIComponent(request.requestId);
          const startDate = new Date(request.requestStartDate + "T00:00:00Z");
          const endDate = new Date(request.requestEndDate + "T00:00:00Z");
          const startLabel = formatter.format(startDate);
          const endLabel = formatter.format(endDate);
          const statusLabel = labels[request.requestStatus];
          const entry = (
            <li key={request.requestId} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="break-words font-medium">{request.borrowerName}</h3>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{statusLabel}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{request.groupName}</p>
              <p className="mt-1 text-sm">{startLabel} – {endLabel}</p>
              <Link href={requestPath} scroll={false} className="mt-3 inline-block text-sm font-medium underline underline-offset-4">View request</Link>
            </li>
          );

          return entry;
        })}
      </ul>
    </section>
  );

  return section;
}
