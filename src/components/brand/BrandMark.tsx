import Image from "next/image";
import { cx } from "@/lib/cx";

/**
 * The supplied logo files, used as-is (only transparent padding trimmed).
 *  - panther : the head alone — navbar, favicon, small sizes
 *  - badge   : round neon logo (ring, palm, triangle) — hero, cards
 *  - logo    : badge + "VERY PINK CLUB" lockup — footer, splash
 *  - wordmark: the sticker wordmark — big typographic moments
 * Size by height; width follows the file's real aspect ratio.
 */
const FILES = {
  panther: { src: "/brand/vpc-panther.png", width: 474, height: 453 },
  badge: { src: "/brand/vpc-badge.png", width: 406, height: 404 },
  logo: { src: "/brand/vpc-logo.png", width: 442, height: 541 },
  wordmark: { src: "/brand/vpc-wordmark.png", width: 987, height: 980 },
} as const;

export type BrandVariant = keyof typeof FILES;

export function BrandMark({
  variant = "panther",
  height,
  priority,
  decorative,
  className,
}: {
  variant?: BrandVariant;
  height: number;
  priority?: boolean;
  /** True when a visible text label already names the club. */
  decorative?: boolean;
  className?: string;
}) {
  const f = FILES[variant];
  const width = Math.round((f.width / f.height) * height);
  return (
    <Image
      src={f.src}
      width={width}
      height={height}
      alt={decorative ? "" : "Very Pink Club"}
      priority={priority}
      sizes={`${width}px`}
      className={cx("select-none", className)}
      draggable={false}
    />
  );
}
