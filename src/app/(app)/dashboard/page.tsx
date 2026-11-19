import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { requireUser } from "@/server/auth/session";

const activityLabels = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Returned",
};

const updatedTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  const activeInventory = { ownerId: user.id, itemArchivedAt: null };
  const [items, activeCount, archivedCount, borrowing, lending] = await Promise.all([
    prisma.item.findMany({
      where: activeInventory,
      orderBy: [{ itemCreatedAt: "desc" }, { itemId: "desc" }],
      take: 6,
      select: { itemId: true, itemName: true },
    }),
    prisma.item.count({ where: activeInventory }),
    prisma.item.count({ where: { ownerId: user.id, itemArchivedAt: { not: null } } }),
    getRecentRequests({ borrowerId: user.id }),
    getRecentRequests({ item: { ownerId: user.id } }),
  ]);

  return (
    <div className="space-y-5">
      <section aria-labelledby="my-inventory" className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="my-inventory" className="text-xl font-semibold tracking-tight">My inventory</h2>
            <p className="mt-1 text-sm text-muted-foreground">{activeCount} active · {archivedCount} archived</p>
          </div>
          <Link href="/myitems" className={buttonVariants({ variant: "outline" })}>
            View inventory <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="mt-5 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">No active items in your inventory yet.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {items.map((item) => (
              <li key={item.itemId} className="min-w-0 rounded-xl border p-3">
                <ItemThumbnail />
                <p className="mt-2 truncate text-sm font-medium" title={item.itemName}>{item.itemName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <RequestSection direction="borrowing" requests={borrowing} />
      <RequestSection direction="lending" requests={lending} />
    </div>
  );
}

function getRecentRequests(where: Prisma.RequestWhereInput) {
  return prisma.request.findMany({
    where,
    orderBy: [{ requestUpdatedAt: "desc" }, { requestId: "desc" }],
    take: 3,
    select: {
      requestId: true,
      requestStatus: true,
      requestUpdatedAt: true,
      borrower: { select: { name: true } },
      item: { select: { itemName: true, owner: { select: { name: true } } } },
    },
  });
}

function RequestSection({
  direction,
  requests,
}: {
  direction: "borrowing" | "lending";
  requests: Awaited<ReturnType<typeof getRecentRequests>>;
}) {
  const borrowing = direction === "borrowing";

  return (
    <section aria-labelledby={direction} className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={direction} className="text-xl font-semibold tracking-tight">
            {borrowing ? "Borrowed from others" : "Borrowed by others"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {borrowing ? "Recent requests you’ve sent" : "Recent requests for your items"}
          </p>
        </div>
        {/* TODO: Link to the corresponding borrowing or lending page when its route is available. */}
        <span title={`${borrowing ? "Borrowing" : "Lending"} page coming soon`}>
          <Button type="button" variant="outline" disabled>
            View {direction} requests <ArrowRight aria-hidden="true" />
          </Button>
        </span>
      </div>
      {requests.length === 0 ? (
        <p className="mt-5 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          {borrowing ? "You haven’t sent any borrowing requests yet." : "No one has requested your items yet."}
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {requests.map((request) => (
            <li key={request.requestId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <ItemThumbnail />
              <div className="min-w-32 flex-1 wrap-break-word">
                <p className="font-medium">{request.item.itemName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {borrowing ? `Owner: ${request.item.owner.name}` : `Borrower: ${request.borrower.name}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {activityLabels[request.requestStatus]}
                </span>
                <time dateTime={request.requestUpdatedAt.toISOString()} className="text-xs text-muted-foreground">
                  {updatedTime.format(request.requestUpdatedAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemThumbnail() {
  return (
    // TODO: Show the Item cover once its image field and read route are ready.
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
      <Package className="size-5" />
    </span>
  );
}
