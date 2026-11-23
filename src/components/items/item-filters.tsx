"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ITEM_CATEGORIES, ITEM_CONDITIONS, type ItemFilters as Filters } from "@/lib/items/item-types";

const selectClassName = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm focus-visible:outline-2 disabled:opacity-50";

export function ItemFilters({ filters }: { filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const hasFilters = ["category", "condition", "availability"].some(key => searchParams.has(key));

  function update(key?: keyof Filters, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key) {
      if (value) params.set(key, value);
      else params.delete(key);
    } else {
      for (const name of ["category", "condition", "availability"]) params.delete(name);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <section aria-label="Filter items" aria-busy={pending} className="mb-8 rounded-xl border p-4">
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Filter items</legend>
        <label className="space-y-2 text-sm font-medium">
          <span>Category</span>
          <select className={selectClassName} value={filters.category ?? ""} onChange={event => update("category", event.target.value)}>
            <option value="">All categories</option>
            {ITEM_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Condition</span>
          <select className={selectClassName} value={filters.condition ?? ""} onChange={event => update("condition", event.target.value)}>
            <option value="">All conditions</option>
            {ITEM_CONDITIONS.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Availability</span>
          <select className={selectClassName} value={filters.availability ?? ""} onChange={event => update("availability", event.target.value)}>
            <option value="">All availability</option>
            <option value="AVAILABLE">Available</option>
            <option value="BORROWED">Borrowed</option>
          </select>
        </label>
        <div className="flex items-end"><Button type="button" variant="outline" disabled={!hasFilters} onClick={() => update()}>Clear filters</Button></div>
      </fieldset>
      {pending && <p role="status" className="mt-3 text-sm text-muted-foreground">Updating items...</p>}
    </section>
  );
}
