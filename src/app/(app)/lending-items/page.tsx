import type { Metadata } from "next";
import { Suspense } from "react";

import { LendingItemsList } from "@/components/requests/lending-items-list";
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
  await requireUser();

  const content = <LendingItemsList />;

  return content;
}
