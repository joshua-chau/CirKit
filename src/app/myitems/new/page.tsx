"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateItemInput } from "@/lib/items/item-validation";
import { ItemImagePicker, uploadItemPhoto } from "@/components/items/item-image-picker";

type CreateItemResponse = {
  data?: { itemId: string };
  error?: { code: string; message: string };
};

const categories = ["Power tools", "Hand tools", "Home & kitchen", "Garden & outdoor", "Electronics", "Sports & recreation", "Other"];
const conditions = ["Like new", "Good", "Normal", "Poor"];
const selectClassName = "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50";

export default function AddItemPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const formData = new FormData(event.currentTarget);
    const input: CreateItemInput = {
      itemName: String(formData.get("itemName") ?? "").trim(),
      itemCategory: String(formData.get("itemCategory") ?? "").trim(),
      itemCondition: String(formData.get("itemCondition") ?? "").trim(),
      itemDescription: String(formData.get("itemDescription") ?? "").trim(),
    };
    if (!createdItemId && Object.values(input).some(value => value.length === 0)) {
      setError("Complete all four fields. Fields cannot contain only spaces.");
      return;
    }

    submitting.current = true;
    setPending(true);
    try {
      if (createdItemId) {
        if (photo) await uploadItemPhoto(createdItemId, photo);
        router.push(`/myitems/${encodeURIComponent(createdItemId)}`);
        return;
      }
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 401) throw new Error("Please sign in before adding an item.");
      const result: CreateItemResponse = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to add your item.");
      if (!result.data?.itemId) throw new Error("The server returned an unexpected response.");
      setCreatedItemId(result.data.itemId);
      if (photo) {
        try {
          await uploadItemPhoto(result.data.itemId, photo);
        } catch (error) {
          throw new Error(`Your item was saved, but its photo was not uploaded. ${error instanceof Error ? error.message : "Please retry."}`);
        }
      }
      router.push(`/myitems/${encodeURIComponent(result.data.itemId)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to add your item.");
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/myitems" className="text-sm underline underline-offset-4">Back to My Items</Link>
      <header className="my-8">
        <h1 className="text-3xl font-semibold tracking-tight">Add Item</h1>
        <p className="mt-2 text-muted-foreground">Describe your item. All four fields are required.</p>
      </header>
      <form onSubmit={handleSubmit} aria-busy={pending} aria-describedby={error ? "item-form-error" : undefined} className="rounded-xl border bg-card p-6 sm:p-8">
        <fieldset disabled={pending || createdItemId !== null} className="space-y-6">
          <legend className="sr-only">Item details</legend>
          <div className="space-y-2">
            <Label htmlFor="itemName">Name</Label>
            <Input id="itemName" name="itemName" required placeholder="e.g. Cordless drill" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="itemCategory">Category</Label>
              <select id="itemCategory" name="itemCategory" required defaultValue="" className={selectClassName}>
                <option value="" disabled>Select a category</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCondition">Condition</Label>
              <select id="itemCondition" name="itemCondition" required defaultValue="" className={selectClassName}>
                <option value="" disabled>Select a condition</option>
                {conditions.map(condition => <option key={condition} value={condition}>{condition}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="itemDescription">Description</Label>
            <textarea id="itemDescription" name="itemDescription" required rows={5}
              placeholder="Describe the item and any accessories or useful details."
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50" />
          </div>
          <p className="text-sm text-muted-foreground">New items are automatically marked as Available.</p>
        </fieldset>
        <div className="mt-6"><ItemImagePicker file={photo} onChange={setPhoto} disabled={pending} /></div>
        {createdItemId && <p role="status" className="mt-4 text-sm">Your item is saved. Select a photo and retry, or clear the selection to continue without one.</p>}
        {error && <p id="item-form-error" role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : createdItemId ? "Continue" : "Add Item"}</Button>
          {!pending && <Link href="/myitems" className="text-sm underline underline-offset-4">Cancel</Link>}
        </div>
      </form>
    </main>
  );
}
