import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemRequests, type ReceivedItemRequest } from "@/components/items/item-requests";
import { ItemArchiveButton } from "@/components/items/item-archive-button";
import { ItemPhotoEditor } from "@/components/items/item-photo-editor";
import { ItemRefreshButton } from "@/components/items/item-refresh-button";
import { ItemError } from "@/lib/items/item-errors";
import { getMyItem, getReceivedItemRequests } from "@/lib/items/item-service";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { requireUser } from "@/server/auth/session";
import { mapItemToView } from "@/server/items/item-view";

type Props = { params: Promise<{ itemId: string }> };

// Changed: Read the item and received requests together on the server.
export default function ItemPage({ params }: Props) {
  const page = (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/myitems" className="text-sm underline underline-offset-4">Back to My Items</Link>
      <Suspense fallback={<p role="status" className="mt-8">Loading item…</p>}>
        <ItemContent params={params} />
      </Suspense>
    </div>
  );

  return page;
}

async function ItemContent({ params }: Props) {
  const user = await requireUser();
  const { itemId } = await params;
  let record;
  let requestRecords;
  try {
    record = await getMyItem(user.id, itemId);
    requestRecords = await getReceivedItemRequests(user.id, itemId);
  } catch (error) {
    if (error instanceof ItemError) {
      if (error.code === "NOT_FOUND" || error.code === "FORBIDDEN") {
        notFound();
      }
    }
    console.error("Could not load item details:", error);
    const failure = (
      <div role="alert" className="mt-8 rounded-xl border p-6">
        <p>Unable to load this item.</p>
        <ItemRefreshButton label="Try again" />
      </div>
    );

    return failure;
  }
  const item = mapItemToView(record);
  const requests: ReceivedItemRequest[] = [];
  for (const requestRecord of requestRecords) {
    const response = mapRequestRecordToResponse(requestRecord);
    requests.push({
      ...response,
      borrowerName: requestRecord.borrower.name,
      groupName: requestRecord.group.name,
    });
  }
  let availability = "Available";
  if (item.itemStatus === "BORROWED") {
    availability = "Borrowed";
  }
  if (item.itemArchivedAt !== null) {
    availability = "Archived";
  }
  const details = (
    <article className="mt-8 min-w-0 rounded-xl border bg-card p-6 text-card-foreground sm:p-8">
      <h1 className="break-words text-3xl font-semibold">{item.itemName}</h1>
      {item.itemArchivedAt !== null && <p role="status" className="mt-3 rounded-lg bg-secondary p-3 text-sm">Archived. Details and request history are retained.</p>}
      <ItemPhotoEditor item={item} />
      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Category</dt><dd className="mt-1">{item.itemCategory}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Condition</dt><dd className="mt-1">{item.itemCondition}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Availability</dt><dd className="mt-1">{availability}</dd></div>
      </dl>
      <section className="mt-8 border-t pt-6" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-lg font-semibold">Description</h2>
        <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{item.itemDescription}</p>
      </section>
      <ItemRequests requests={requests} />
      {item.itemArchivedAt === null && <ItemArchiveButton item={item} />}
    </article>
  );

  return details;
}
