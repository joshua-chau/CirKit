import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { ItemRefreshButton } from "@/components/items/item-refresh-button";
import { getMyItems } from "@/lib/items/item-service";
import type { ItemSummary, ItemFilters as Filters } from "@/lib/items/item-types";
import { ItemFilters } from "@/components/items/item-filters";
import { ItemValidationError, validateItemFilters } from "@/lib/items/item-validation";
import { requireUser } from "@/server/auth/session";
import { mapItemToView } from "@/server/items/item-view";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Changed: Read the inventory on the server and keep the list selection in the URL.
export default function MyItemsPage({ searchParams }: Props) {
  const page = (
    <Suspense fallback={<p role="status">Loading your items…</p>}>
      <MyItemsContent searchParams={searchParams} />
    </Suspense>
  );

  return page;
}

async function MyItemsContent({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const archived = params.archived === "true";
  const items: ItemSummary[] = [];
  let filters: Filters = {};
  let loadError = "";
  try {
    filters = validateItemFilters(params);
    const records = await getMyItems(user.id, archived, filters);
    for (const record of records) {
      const item = mapItemToView(record);
      items.push({ ...item, activeRequestCount: record.activeRequestCount });
    }
  } catch (error) {
    if (error instanceof ItemValidationError) {
      loadError = error.message;
    } else {
      console.error("Could not load owned items:", error);
      loadError = "Could not load your items. Try again.";
    }
  }

  const active: ItemSummary[] = [];
  const inactive: ItemSummary[] = [];
  for (const item of items) {
    if (item.itemStatus === "BORROWED" || item.activeRequestCount > 0) {
      active.push(item);
    } else {
      inactive.push(item);
    }
  }
  let sections = [
    { title: "Active items", description: "Items with pending requests or currently lent out.", items: active },
    { title: "Inactive items", description: "Available items with no pending or approved requests.", items: inactive },
  ];
  let emptyTitle = "No items yet";
  let emptyDescription = "Items you add will appear here.";
  let currentVariant: "default" | "outline" = "default";
  let archivedVariant: "default" | "outline" = "outline";
  let currentPage: "page" | undefined = "page";
  let archivedPage: "page" | undefined;
  if (archived) {
    sections = [{ title: "Archived items", description: "Details and request history are retained.", items: items }];
    emptyTitle = "No archived items";
    emptyDescription = "Items you archive will appear here.";
    currentVariant = "outline";
    archivedVariant = "default";
    currentPage = undefined;
    archivedPage = "page";
  }
  const currentClass = buttonVariants({ variant: currentVariant });
  const filterParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) filterParams.set(key, value);
  }
  const hasFilters = filterParams.size > 0;
  const currentHref = hasFilters ? `/myitems?${filterParams}` : "/myitems";
  filterParams.set("archived", "true");
  const archivedHref = `/myitems?${filterParams}`;
  if (hasFilters) {
    emptyTitle = "No matching items";
    emptyDescription = "Try different filters or clear them to see all items in this list.";
  }
  const archivedClass = buttonVariants({ variant: archivedVariant });
  const addClass = buttonVariants({ variant: "default" });
  const showEmpty = !loadError && items.length === 0;

  const page = (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">My Items</h1>
        <p className="text-muted-foreground">Your items and their current availability.</p>
        <Link href="/myitems/new" className={addClass}>Add Item</Link>
      </header>
      <nav aria-label="Item lists" className="mb-6 flex gap-2">
        <Link href={currentHref} aria-current={currentPage} className={currentClass}>Current</Link>
        <Link href={archivedHref} aria-current={archivedPage} className={archivedClass}>Archived</Link>
        <ItemRefreshButton />
      </nav>
      <ItemFilters filters={filters} />
      {loadError && <p role="alert">{loadError}</p>}
      {showEmpty && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="text-lg font-medium">{emptyTitle}</h2>
          <p className="mt-2 text-muted-foreground">{emptyDescription}</p>
        </div>
      )}
      {!loadError && items.length > 0 && sections.map((section) => {
        const sectionView = (
          <section key={section.title} aria-label={section.title} className="mb-10 space-y-3">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            <p className="text-muted-foreground">{section.description}</p>
            <p>{section.items.length} items</p>
            {section.items.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">No items in this section.</p>}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => {
                const itemPath = "/myitems/" + encodeURIComponent(item.itemId);
                let status = "Available";
                if (item.itemStatus === "BORROWED") {
                  status = "Borrowed";
                }
                if (item.itemArchivedAt !== null) {
                  status = "Archived";
                }
                const card = (
                  <li key={item.itemId} className="min-w-0 rounded-xl border bg-card p-5 text-card-foreground">
                    {item.itemImageUrl && <Image src={item.itemImageUrl} alt={item.itemName} width={480} height={320} unoptimized className="mb-4 h-40 w-full rounded-lg object-contain" />}
                    <h3 className="break-words text-lg font-semibold"><Link href={itemPath} className="hover:underline">{item.itemName}</Link></h3>
                    {item.activeRequestCount > 0 && <p className="mt-2 text-sm">{item.activeRequestCount} active requests</p>}
                    <dl className="mt-4 space-y-3">
                      <div><dt>Category</dt><dd>{item.itemCategory}</dd></div>
                      <div><dt>Condition</dt><dd>{item.itemCondition}</dd></div>
                      <div><dt>Availability</dt><dd>{status}</dd></div>
                    </dl>
                  </li>
                );

                return card;
              })}
            </ul>
          </section>
        );

        return sectionView;
      })}
    </div>
  );

  return page;
}
