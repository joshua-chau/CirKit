import type { RequestResponse } from "@/lib/requests/request-types";

type RequestStatus = RequestResponse["requestStatus"];

const statusLabels: Record<RequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Borrowing",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const label = statusLabels[status];
  const badge = (
    <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );

  return badge;
}
