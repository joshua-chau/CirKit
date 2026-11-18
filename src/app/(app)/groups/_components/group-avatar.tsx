"use client";

import { useState } from "react";
import Image from "next/image";

const sizes = {
  sm: "size-10 text-sm",
  md: "size-12 text-base",
  lg: "size-20 text-2xl",
} as const;
const pixels = { sm: 40, md: 48, lg: 80 } as const;

type Props = { src: string | null; name: string; size?: keyof typeof sizes };

/** Up to two initials: "Tool Library" → "TL", "climbing" → "C". */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/**
 * Round group picture. Falls back to the group's initials when there is no
 * picture or it fails to load (e.g. storage unavailable).
 */
export function GroupAvatar({ src, name, size = "md" }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = `${sizes[size]} shrink-0 overflow-hidden rounded-full border bg-muted`;

  if (!src || failedSrc === src) {
    return (
      <div
        aria-hidden
        className={`${box} grid place-items-center font-medium text-muted-foreground`}
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <div className={box}>
      {/* unoptimized: the image route needs the viewer's session cookie. */}
      <Image
        src={src}
        alt=""
        width={pixels[size]}
        height={pixels[size]}
        unoptimized
        className="size-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
