"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function ItemImagePicker({ file, onChange, disabled = false }: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  return (
    <div className="space-y-3">
      <p id={`${id}-label`} className="text-sm font-medium">Photo (optional)</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={disabled}
          aria-describedby={`${id}-help`} onClick={() => inputRef.current?.click()}>
          {file ? "Choose another photo" : "Upload photo"}
        </Button>
        <span className="break-all text-sm text-muted-foreground" aria-live="polite">{file?.name ?? "No photo selected"}</span>
      </div>
      <input ref={inputRef} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
        aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} hidden
        onChange={event => {
          const selected = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (selected && (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 2 * 1024 * 1024 || selected.size === 0)) {
            setError("Choose a non-empty JPEG, PNG, or WebP photo up to 2 MiB.");
            return;
          }
          setError(null);
          if (selected) {
            setPreview(URL.createObjectURL(selected));
            onChange(selected);
          }
        }} />
      <p id={`${id}-help`} className="text-sm text-muted-foreground">One JPEG, PNG, or WebP photo, up to 2 MiB.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {file && preview && <Image src={preview} alt="Selected item photo preview" width={480} height={320} unoptimized className="max-h-64 w-auto rounded-lg object-contain" />}
      {file && <button type="button" disabled={disabled} onClick={() => { onChange(null); setPreview(null); setError(null); }} className="text-sm underline">Clear selected photo</button>}
    </div>
  );
}

export async function uploadItemPhoto(itemId: string, file: File) {
  const body = new FormData();
  body.set("image", file);
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/image`, { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Unable to upload the photo.");
  if (!result.data || typeof result.data.itemImageUrl !== "string") {
    throw new Error("The server returned an unexpected image response.");
  }
  return result.data as { itemImageUrl: string };
}
