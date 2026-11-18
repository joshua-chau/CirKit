"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Item } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";

type ItemSummary = Pick<
  Item,
  "itemId" | "itemName" | "itemCategory" | "itemCondition" | "itemStatus"
> & { itemImageUrl: string | null; activeRequestCount: number };

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

  const isActive = (item: ItemSummary) => item.itemStatus === "BORROWED" || item.activeRequestCount > 0;
  const sections = [
    { title: "Active items", description: "Items with pending requests or currently lent out.", items: items.filter(isActive) },
    { title: "Inactive items", description: "Available items with no pending or approved requests.", items: items.filter(item => !isActive(item)) },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8">
        <p className="mb-2 text-sm font-medium text-muted-foreground">CirKit</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Items</h1>
        <p className="mt-2 text-muted-foreground">
          Your items and their current availability.
        </p>
        <Link
          href="/myitems/new"
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Add Item
        </Link>
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
          <div className="space-y-10">
          {sections.map(section => (
          <section key={section.title} aria-label={section.title}>
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
            <p className="mb-4 text-sm text-muted-foreground">
              {section.items.length} {section.items.length === 1 ? "item" : "items"}
            </p>
            {section.items.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">No {section.title.toLowerCase()}.</p>}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map(item => (
                <li key={item.itemId} className="min-w-0 rounded-xl border bg-card p-5 text-card-foreground">
                  {item.itemImageUrl && <Image src={item.itemImageUrl} alt={item.itemName} width={480} height={320} unoptimized className="mb-4 h-40 w-full rounded-lg object-contain" />}
                  <h3 className="break-words text-lg font-semibold">
                    <Link
                      href={`/myitems/${encodeURIComponent(item.itemId)}`}
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {item.itemName}
                    </Link>
                  </h3>
                  {item.activeRequestCount > 0 && <p className="mt-2 text-sm text-muted-foreground">{item.activeRequestCount} active {item.activeRequestCount === 1 ? "request" : "requests"}</p>}
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
          </section>
          ))}
          </div>
        )}
      </section>
    </main>
  );
}
