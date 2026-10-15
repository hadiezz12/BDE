import Image from "next/image";
import type { AccentKey, Photo } from "@/lib/types";
import { cx } from "@/lib/cx";

/**
 * Person avatar: photo when there is one, otherwise initials on a tinted disc.
 * `src` is a short-lived signed URL from the private avatars bucket: shown
 * unoptimized (the link expires, and the image server must not cache it).
 */
export function Avatar({
  name,
  photo,
  src,
  accent,
  size = 40,
  className,
}: {
  name: string;
  photo?: Photo;
  src?: string;
  accent?: AccentKey;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      data-accent={accent}
      className={cx(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-assoc-soft text-assoc-text",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
      ) : photo ? (
        <Image src={photo.src} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span aria-hidden className="font-black" style={{ fontSize: size * 0.38, fontStretch: "88%" }}>
          {initials}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
