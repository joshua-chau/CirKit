"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ItemImagePicker, uploadItemPhoto } from "@/components/items/item-image-picker";
import { useParams } from "next/navigation";
import type { Item } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { ItemRequests } from "@/components/items/item-requests";

type ItemDetails = Pick<Item,
  "itemId" | "itemName" | "itemCategory" | "itemCondition" | "itemStatus" | "itemDescription"
> & { itemImageUrl: string | null; itemArchivedAt: string | null };

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
      {item.itemArchivedAt && <p role="status" className="mt-3 rounded-lg bg-secondary p-3 text-sm">Archived. This item is hidden from current and group listings. Its details and request history are retained.</p>}
      <ItemPhotoEditor item={item} />
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
              {item.itemArchivedAt ? "Archived" : item.itemStatus === "AVAILABLE" ? "Available" : "Borrowed"}
            </span>
          </dd>
        </div>
      </dl>
      <section className="mt-8 border-t pt-6" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-lg font-semibold">Description</h2>
        <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{item.itemDescription}</p>
      </section>
      <ItemRequests key={item.itemArchivedAt ?? "current"} itemId={item.itemId} />
      {!item.itemArchivedAt && <ArchiveItem item={item} onArchived={setItem} />}
    </article>
  );
}

function ArchiveItem({ item, onArchived }: { item: ItemDetails; onArchived: (item: ItemDetails) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function archive() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(item.itemId)}/archive`, { method: "POST" });
      const result: ItemResponse = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to archive this item.");
      if (!result.data || result.data.itemId !== item.itemId || !result.data.itemArchivedAt) {
        throw new Error("The server returned an unexpected response. Reload the item to check its archive status.");
      }
      onArchived(result.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to archive this item.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-label="Archive item" aria-busy={pending} className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Archive item</h2>
      {item.itemStatus === "BORROWED" ? <p className="mt-3 text-sm text-muted-foreground">This item must be returned before you can archive it.</p>
        : confirming ? <div role="group" aria-label="Confirm archiving" className="mt-3 space-y-4">
          <p className="text-sm">Archive “{item.itemName}”? It will be hidden from current and group listings, and pending requests will be declined. Details and request history remain available. Archived items cannot currently be restored.</p>
          <div className="flex gap-3">
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void archive()}>{pending ? "Archiving..." : "Confirm archive"}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirming(false); setError(null); }}>Cancel</Button>
          </div>
        </div> : <Button type="button" variant="outline" className="mt-3" onClick={() => setConfirming(true)}>Archive item</Button>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function ItemPhotoEditor({ item }: { item: ItemDetails }) {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(item.itemImageUrl);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  async function save(remove: boolean) {
    if (busy.current || (!remove && !file)) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    try {
      if (remove) {
        const response = await fetch(`/api/items/${encodeURIComponent(item.itemId)}/image`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.message ?? "Unable to remove photo.");
        }
        setImageUrl(null);
      } else {
        const result = await uploadItemPhoto(item.itemId, file!);
        setImageUrl(result.itemImageUrl);
        setVersion(value => value + 1);
      }
      setFile(null);
      setMessage(remove ? "Photo removed." : "Photo saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save photo.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-label="Item photo" aria-busy={pending} className="mt-6 space-y-4">
      {imageUrl && <Image key={version} src={`${imageUrl}?v=${version}`} alt={item.itemName} width={640} height={480} unoptimized className="max-h-80 w-auto rounded-lg object-contain" />}
      <ItemImagePicker file={file} onChange={setFile} disabled={pending} />
      <div className="flex gap-3">
        <Button disabled={pending || !file} onClick={() => void save(false)}>{pending ? "Saving..." : imageUrl ? "Replace photo" : "Upload photo"}</Button>
        {imageUrl && <Button variant="outline" disabled={pending} onClick={() => void save(true)}>Remove photo</Button>}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
