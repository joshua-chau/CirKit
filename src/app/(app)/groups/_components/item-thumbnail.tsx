"use client";

import { useState } from "react";
import Image from "next/image";

type Props = { src: string | null; name: string };

/**
 * Square item picture for list rows. Falls back to the item's first letter
 * when there is no picture or it fails to load (e.g. storage unavailable).
 */
export function ItemThumbnail({ src, name }: Props) {
  const [failed, setFailed] = useState(false);
  const box = "size-16 shrink-0 overflow-hidden rounded-lg border bg-muted";

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={`${box} grid place-items-center text-lg font-medium text-muted-foreground`}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </div>
    );
  }

  return (
    <div className={box}>
      {/* unoptimized: the image route needs the viewer's session cookie. */}
      <Image
        src={src}
        alt={name}
        width={64}
        height={64}
        unoptimized
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
