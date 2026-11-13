"use client";

import { useEffect, useState } from "react";
import type { Item } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";

type ItemSummary = Pick<
  Item,
  "itemId" | "itemName" | "itemCategory" | "itemCondition" | "itemStatus"
>;

type ItemsResponse = {
  data?: ItemSummary[];
  error?: { code: string; message: string };
};

export default function MyItemsPage() {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadItems() {
      try {
        const response = await fetch("/api/items", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          throw new Error("Please sign in to view your items.");
        }
        const result: ItemsResponse = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message ?? "Unable to load your items.");
        }
        if (!Array.isArray(result.data)) {
          throw new Error("The server returned an unexpected response.");
        }
        if (!controller.signal.aborted) setItems(result.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Unable to load your items.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadItems();
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setError(null);
    setLoading(true);
    setAttempt(value => value + 1);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8">
        <p className="mb-2 text-sm font-medium text-muted-foreground">CirKit</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Items</h1>
        <p className="mt-2 text-muted-foreground">
          Your items and their current availability.
        </p>
      </header>

      <section aria-label="Your items" aria-busy={loading}>
        {loading ? (
          <p role="status" className="rounded-xl border p-8 text-center text-muted-foreground">
            Loading your items…
          </p>
        ) : error ? (
          <div role="alert" className="rounded-xl border p-8 text-center">
            <p className="mb-4 text-destructive">{error}</p>
            <Button variant="outline" onClick={retry}>Try again</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <h2 className="text-lg font-medium">No items yet</h2>
            <p className="mt-2 text-muted-foreground">
              Items you add will appear here.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <li key={item.itemId} className="min-w-0 rounded-xl border bg-card p-5 text-card-foreground">
                  <h2 className="break-words text-lg font-semibold">{item.itemName}</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="mt-1 break-words">{item.itemCategory}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Condition</dt>
                      <dd className="mt-1 break-words">{item.itemCondition}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Availability</dt>
                      <dd className="mt-1">
                        <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                          {item.itemStatus === "AVAILABLE" ? "Available" : "Borrowed"}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
