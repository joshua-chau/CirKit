"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ItemImagePicker } from "@/components/items/item-image-picker";
import type { ItemDetails } from "@/lib/items/item-types";
import { loginUrlFor } from "@/lib/routes";
import { removeItemImageAction, setItemImageAction } from "@/server/items/item.actions";

/** Changed: Photo writes use Actions and the displayed image comes from server props. */
export function ItemPhotoEditor({ item }: { item: ItemDetails }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  function save(remove: boolean): void {
    if (pending || busy.current || (!remove && file === null)) {
      return;
    }
    busy.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        let result;
        if (remove) {
          result = await removeItemImageAction(item.itemId);
        } else {
          const formData = new FormData();
          if (file !== null) {
            formData.set("image", file);
          }
          result = await setItemImageAction(item.itemId, formData);
        }
        if (!result.ok) {
          if (result.code === "UNAUTHENTICATED") {
            const path = "/myitems/" + encodeURIComponent(item.itemId);
            const loginPath = loginUrlFor(path);
            router.push(loginPath);
            return;
          }
          setMessage(result.error);
          return;
        }
        setFile(null);
        let success = "Photo saved.";
        if (remove) {
          success = "Photo removed.";
        }
        setMessage(success);
      } catch {
        setMessage("Could not confirm the photo update. Refresh to check its status.");
      } finally {
        busy.current = false;
      }
    });
  }

  let imageSource = "";
  if (item.itemImageUrl !== null) {
    const version = encodeURIComponent(item.itemUpdatedAt);
    imageSource = item.itemImageUrl + "?v=" + version;
  }
  let saveLabel = "Upload photo";
  if (pending) {
    saveLabel = "Saving…";
  } else if (item.itemImageUrl !== null) {
    saveLabel = "Replace photo";
  }
  const section = (
    <section aria-label="Item photo" aria-busy={pending} className="mt-6 space-y-4">
      {imageSource && <Image src={imageSource} alt={item.itemName} width={640} height={480} unoptimized className="max-h-80 w-auto rounded-lg object-contain" />}
      <ItemImagePicker key={item.itemUpdatedAt} file={file} onChange={setFile} disabled={pending} />
      <div className="flex gap-3">
        <Button disabled={pending || file === null} onClick={() => {
          save(false);
        }}>{saveLabel}</Button>
        {imageSource && <Button variant="outline" disabled={pending} onClick={() => {
          save(true);
        }}>Remove photo</Button>}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );

  return section;
}
