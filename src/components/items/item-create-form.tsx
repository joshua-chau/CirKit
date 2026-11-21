"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemImagePicker } from "@/components/items/item-image-picker";
import { loginUrlFor } from "@/lib/routes";
import { createItemAction, setItemImageAction } from "@/server/items/item.actions";

const categories = ["Power tools", "Hand tools", "Home & kitchen", "Garden & outdoor", "Electronics", "Sports & recreation", "Other"];
const conditions = ["Like new", "Good", "Normal", "Poor"];
const selectClassName = "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50";

/** Added: Create once, then retry photo upload independently after a partial failure. */
export function ItemCreateForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  function goToLogin(): void {
    const loginPath = loginUrlFor("/myitems/new");
    router.push(loginPath);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || busy.current) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    busy.current = true;
    setError("");
    startTransition(async () => {
      let savedId = createdItemId;
      try {
        if (savedId === null) {
          const result = await createItemAction(formData);
          if (!result.ok) {
            if (result.code === "UNAUTHENTICATED") {
              goToLogin();
              return;
            }
            setError(result.error);
            return;
          }
          savedId = result.itemId;
          setCreatedItemId(savedId);
        }
        if (photo !== null) {
          const photoForm = new FormData();
          photoForm.set("image", photo);
          const photoResult = await setItemImageAction(savedId, photoForm);
          if (!photoResult.ok) {
            if (photoResult.code === "UNAUTHENTICATED") {
              goToLogin();
              return;
            }
            setError("Your item was saved, but its photo was not uploaded. " + photoResult.error);
            return;
          }
        }
        const itemPath = "/myitems/" + encodeURIComponent(savedId);
        router.push(itemPath);
      } catch {
        let message = "Could not confirm the save. Check My Items before retrying.";
        if (savedId !== null) {
          message = "Your item was saved, but its photo upload could not be confirmed. Retry the photo or continue without one.";
        }
        setError(message);
      } finally {
        busy.current = false;
      }
    });
  }

  let submitLabel = "Add Item";
  if (pending) {
    submitLabel = "Saving…";
  } else if (createdItemId !== null) {
    submitLabel = "Continue";
  }
  const fieldsDisabled = pending || createdItemId !== null;
  const form = (
    <form onSubmit={handleSubmit} aria-busy={pending} className="rounded-xl border bg-card p-6 sm:p-8">
      <fieldset disabled={fieldsDisabled} className="space-y-6">
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
              {categories.map((category) => {
                const option = <option key={category} value={category}>{category}</option>;
                return option;
              })}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="itemCondition">Condition</Label>
            <select id="itemCondition" name="itemCondition" required defaultValue="" className={selectClassName}>
              <option value="" disabled>Select a condition</option>
              {conditions.map((condition) => {
                const option = <option key={condition} value={condition}>{condition}</option>;
                return option;
              })}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="itemDescription">Description</Label>
          <textarea id="itemDescription" name="itemDescription" required rows={5} placeholder="Describe the item and any accessories or useful details." className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm" />
        </div>
        <p className="text-sm text-muted-foreground">New items are automatically marked as Available.</p>
      </fieldset>
      <div className="mt-6"><ItemImagePicker file={photo} onChange={setPhoto} disabled={pending} /></div>
      {createdItemId !== null && <p role="status" className="mt-4 text-sm">Your item is saved. Select a photo and retry, or clear the selection to continue without one.</p>}
      {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex items-center gap-4">
        <Button type="submit" disabled={pending}>{submitLabel}</Button>
        {!pending && <Link href="/myitems" className="text-sm underline underline-offset-4">Cancel</Link>}
      </div>
    </form>
  );

  return form;
}
