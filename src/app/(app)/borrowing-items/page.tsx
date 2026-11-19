import type { Metadata } from "next";
import { Suspense } from "react";

import { BorrowingItemsList } from "@/components/requests/borrowing-items-list";
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
  await requireUser();

  const content = <BorrowingItemsList />;
  return content;
}
