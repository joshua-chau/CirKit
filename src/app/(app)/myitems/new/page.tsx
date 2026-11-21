import { Suspense } from "react";
import Link from "next/link";
import { ItemCreateForm } from "@/components/items/item-create-form";
import { requireUser } from "@/server/auth/session";

// Changed: The page is server-rendered; file selection and submission are client interactions.
export default function AddItemPage() {
  const page = (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/myitems" className="text-sm underline underline-offset-4">Back to My Items</Link>
      <header className="my-8">
        <h1 className="text-3xl font-semibold">Add Item</h1>
        <p className="mt-2 text-muted-foreground">Describe your item. All four fields are required.</p>
      </header>
      <Suspense fallback={<p role="status">Loading item form…</p>}>
        <CreateItemContent />
      </Suspense>
    </div>
  );

  return page;
}

async function CreateItemContent() {
  await requireUser();
  const form = <ItemCreateForm />;

  return form;
}
