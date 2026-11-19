"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FeedbackToast } from "@/components/ui/feedback-toast";
import { Avatar } from "@/components/avatar";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

type Props = {
  /** API route that takes POST (multipart `image`) and DELETE. */
  endpoint: string;
  /** Used for the initials fallback. */
  name: string;
  /** Current picture URL, or null. */
  image: string | null;
  /** Confirmation text for removing, e.g. "Remove the group picture?". */
  removeConfirm: string;
};

/** Picture controls: choose → preview → upload/replace, or remove. */
export function PictureEditor({ endpoint, name, image, removeConfirm }: Props) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Free the preview's object URL when it is replaced or the editor unmounts.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function choose(selected: File | null) {
    setMessage(null);
    if (!selected) return;
    if (
      !ACCEPTED.includes(selected.type) ||
      selected.size === 0 ||
      selected.size > MAX_BYTES
    ) {
      setMessage({
        ok: false,
        text: "Choose a JPEG, PNG or WebP picture up to 2 MiB.",
      });
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  function clear() {
    setFile(null);
    setPreview(null);
  }

  async function send(method: "POST" | "DELETE") {
    setPending(true);
    setMessage(null);
    try {
      let body: FormData | undefined;
      if (method === "POST") {
        body = new FormData();
        body.set("image", file!);
      }
      const response = await fetch(endpoint, { method, body });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? "Couldn't save the picture.");
      }
      clear();
      setMessage({
        ok: true,
        text: method === "POST" ? "Picture saved." : "Picture removed.",
      });
      router.refresh(); // re-render server components with the new picture URL
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error ? error.message : "Couldn't save the picture.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4" aria-busy={pending}>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="size-20 shrink-0 overflow-hidden rounded-full border">
            <Image
              src={preview}
              alt="New picture preview"
              width={80}
              height={80}
              unoptimized
              className="size-full object-cover"
            />
          </div>
        ) : (
          <Avatar src={image} name={name} size="lg" />
        )}
        <div className="grid gap-1 text-sm">
          <p className="font-medium">
            {preview ? "Preview" : image ? "Current picture" : "No picture yet"}
          </p>
          <p className="text-muted-foreground" id={`${id}-help`}>
            JPEG, PNG or WebP, up to 2 MiB. Shown as a circle.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        hidden
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          choose(event.target.files?.[0] ?? null);
          event.target.value = ""; // allow picking the same file again
        }}
      />

      <div className="flex flex-wrap gap-2">
        {file ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => void send("POST")}
            >
              {pending
                ? "Saving…"
                : image
                  ? "Replace picture"
                  : "Upload picture"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={clear}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {image ? "Choose a new picture" : "Choose a picture"}
          </Button>
        )}
        {image && !file ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(removeConfirm)) void send("DELETE");
            }}
          >
            {pending ? "Removing…" : "Remove picture"}
          </Button>
        ) : null}
      </div>

      {message?.ok ? (
        <FeedbackToast title={message.text} onDismiss={() => setMessage(null)} />
      ) : message ? (
        <p role="alert" className="text-sm text-destructive">{message.text}</p>
      ) : null}
    </div>
  );
}
