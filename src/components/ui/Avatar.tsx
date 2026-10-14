import Image from "next/image";
import type { AccentKey, Photo } from "@/lib/types";
import { cx } from "@/lib/cx";

/** Person avatar: photo when there is one, otherwise initials on a tinted disc. */
export function Avatar({
  name,
  photo,
  accent,
  size = 40,
  className,
}: {
  name: string;
  photo?: Photo;
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
      {photo ? (
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
