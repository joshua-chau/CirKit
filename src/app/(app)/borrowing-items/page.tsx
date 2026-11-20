import type { Metadata } from "next";
import { Suspense } from "react";

import { BorrowingItemsList } from "@/components/requests/borrowing-items-list";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { getMyRequests } from "@/lib/requests/request-service";
import type { BorrowingItemResponse } from "@/lib/requests/request-types";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Borrowing Items · CirKit",
};

export default function BorrowingItemsPage() {
  const page = (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Borrowing Items</h1>
      <Suspense fallback={<p role="status">Loading borrowing items…</p>}>
        <BorrowingItemsContent />
      </Suspense>
    </section>
  );

  return page;
}

async function BorrowingItemsContent() {
  const user = await requireUser();

  // Changed: Read requests on the server instead of fetching an API in useEffect.
  const requests: BorrowingItemResponse[] = [];
  let loadError = "";

  try {
    const records = await getMyRequests(user.id);

    for (const record of records) {
      const response = mapRequestRecordToResponse(record);

      const borrowingItem: BorrowingItemResponse = {
        ...response,
        itemName: record.item.itemName,
        groupName: record.group.name,
      };

      requests.push(borrowingItem);
    }
  } catch (error) {
    console.error("Could not load borrowing items:", error);
    loadError = "Could not load your borrowing items.";
  }

  // Changed: Pass server-loaded data and any loading error to the client list.
  const content = (
    <BorrowingItemsList
      requests={requests}
      loadError={loadError}
    />
  );
  return content;
}
