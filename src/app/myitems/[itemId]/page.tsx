"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Item } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";

type ItemDetails = Pick<Item,
  "itemId" | "itemName" | "itemCategory" | "itemCondition" | "itemStatus" | "itemDescription"
>;

type ItemResponse = {
  data?: ItemDetails;
  error?: { code: string; message: string };
};

export default function ItemPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/myitems" className="text-sm underline underline-offset-4">
        Back to My Items
      </Link>
      <Suspense fallback={<LoadingItem />}>
        <ItemContent />
      </Suspense>
    </main>
  );
}

function LoadingItem() {
  return <p role="status" className="mt-8 text-muted-foreground">Loading item...</p>;
}

function ItemContent() {
  const { itemId } = useParams<{ itemId: string }>();
  // A route change remounts the loader so the previous item's data is never shown.
  return <ItemLoader key={itemId} itemId={itemId} />;
}

function ItemLoader({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<ItemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadItem() {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) throw new Error("Please sign in to view this item.");
        if (response.status === 403) throw new Error("You can only view items you own here.");
        if (response.status === 404) throw new Error("This item was not found.");
        const result: ItemResponse = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Unable to load this item.");
        if (!result.data || result.data.itemId !== itemId) {
          throw new Error("The server returned an unexpected response.");
        }
        if (!controller.signal.aborted) setItem(result.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Unable to load this item.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadItem();
    return () => controller.abort();
  }, [itemId, attempt]);

  if (loading) return <LoadingItem />;
  if (error) {
    return (
      <div role="alert" className="mt-8 rounded-xl border p-6">
        <p className="mb-4 text-destructive">{error}</p>
        <Button variant="outline" onClick={() => {
          setError(null);
          setLoading(true);
          setAttempt(value => value + 1);
        }}>Try again</Button>
      </div>
    );
  }
  if (!item) return null;

  return (
    <article className="mt-8 min-w-0 rounded-xl border bg-card p-6 text-card-foreground sm:p-8">
      <h1 className="break-words text-3xl font-semibold tracking-tight">{item.itemName}</h1>
      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Category</dt>
          <dd className="mt-1 break-words">{item.itemCategory}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Condition</dt>
          <dd className="mt-1 break-words">{item.itemCondition}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Availability</dt>
          <dd className="mt-1">
            <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {item.itemStatus === "AVAILABLE" ? "Available" : "Borrowed"}
            </span>
          </dd>
        </div>
      </dl>
      <section className="mt-8 border-t pt-6" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-lg font-semibold">Description</h2>
        <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{item.itemDescription}</p>
      </section>
    </article>
  );
}
