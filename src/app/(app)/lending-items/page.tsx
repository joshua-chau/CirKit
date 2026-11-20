import type { Metadata } from "next";
import { Suspense } from "react";

import { LendingItemsList } from "@/components/requests/lending-items-list";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { getReceivedRequests } from "@/lib/requests/request-service";
import type { LendingItemResponse } from "@/lib/requests/request-types";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Lending Items · CirKit",
};

export default function LendingItemsPage() {
  const page = (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Lending Items
        </h1>
        <p className="text-muted-foreground">
          Review requests for your items and view their borrowing history.
        </p>
      </div>

      <Suspense fallback={<p role="status">Loading received requests…</p>}>
        <LendingItemsContent />
      </Suspense>
    </section>
  );

  return page;
}

async function LendingItemsContent() {
  const user = await requireUser();

  // Changed: Load received requests directly in the Server Component.
  const requests: LendingItemResponse[] = [];
  let loadError = "";

  try {
    const records = await getReceivedRequests(user.id);

    for (const record of records) {
      const response = mapRequestRecordToResponse(record);

      const lendingItem: LendingItemResponse = {
        ...response,
        itemName: record.item.itemName,
        borrowerName: record.borrower.name,
        groupName: record.group.name,
      };

      requests.push(lendingItem);
    }
  } catch (error) {
    console.error("Could not load received requests:", error);
    loadError = "Could not load your received requests.";
  }

  // Changed: Pass server-loaded records to the interactive list.
  const content = (
    <LendingItemsList
      requests={requests}
      loadError={loadError}
    />
  );

  return content;
}
