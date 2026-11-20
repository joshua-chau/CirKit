"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

// Changed: This component only selects and previews files; Actions handle uploads.
export function ItemImagePicker({ file, onChange, disabled = false }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    function cleanup(): void {
      if (preview !== null) {
        URL.revokeObjectURL(preview);
      }
    }

    return cleanup;
  }, [preview]);

  let fileName = "No photo selected";
  let chooseLabel = "Upload photo";
  if (file !== null) {
    fileName = file.name;
    chooseLabel = "Choose another photo";
  }
  const view = (
    <div className="space-y-3">
      <p id={id + "-label"} className="text-sm font-medium">Photo (optional)</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={disabled} aria-describedby={id + "-help"} onClick={() => {
          inputRef.current?.click();
        }}>{chooseLabel}</Button>
        <span className="break-all text-sm text-muted-foreground" aria-live="polite">{fileName}</span>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-labelledby={id + "-label"}
        aria-describedby={id + "-help"}
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (selected === null) {
            return;
          }
          const supported = ["image/jpeg", "image/png", "image/webp"];
          if (!supported.includes(selected.type) || selected.size === 0 || selected.size > 2 * 1024 * 1024) {
            setError("Choose a non-empty JPEG, PNG, or WebP photo up to 2 MiB.");
            return;
          }
          const previewUrl = URL.createObjectURL(selected);
          setError("");
          setPreview(previewUrl);
          onChange(selected);
        }}
      />
      <p id={id + "-help"} className="text-sm text-muted-foreground">One JPEG, PNG, or WebP photo, up to 2 MiB.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {file !== null && preview !== null && <Image src={preview} alt="Selected item photo preview" width={480} height={320} unoptimized className="max-h-64 w-auto rounded-lg object-contain" />}
      {file !== null && <button type="button" disabled={disabled} onClick={() => {
        onChange(null);
        setPreview(null);
        setError("");
      }} className="text-sm underline">Clear selected photo</button>}
    </div>
  );

  return view;
}
