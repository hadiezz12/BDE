import Image from "next/image";
import type { AccentKey, Photo } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Poster } from "./Poster";

/**
 * Every image slot goes through MediaFrame: fixed aspect ratio (no layout
 * shift), next/image optimisation, and a designed fallback when there is no
 * photo yet. `slot` names the placement (see lib/media-slots.ts) so generated
 * campaign art (Higgsfield…) can be dropped in later without layout work.
 */
export type Ratio = "21/9" | "16/9" | "3/2" | "4/3" | "1/1" | "4/5" | "3/4" | "2/3";

const RATIO_CLASS: Record<Ratio, string> = {
  "21/9": "aspect-[21/9]",
  "16/9": "aspect-video",
  "3/2": "aspect-[3/2]",
  "4/3": "aspect-[4/3]",
  "1/1": "aspect-square",
  "4/5": "aspect-[4/5]",
  "3/4": "aspect-[3/4]",
  "2/3": "aspect-[2/3]",
};

export interface MediaFrameProps {
  photo?: Photo;
  /** Omit when the parent controls the height (fill mode). */
  ratio?: Ratio;
  /** next/image sizes hint — be honest, it drives the download size. */
  sizes: string;
  priority?: boolean;
  /** Used when there is no photo. */
  fallback: { title: string; accent: AccentKey; kicker?: string; emblem?: string };
  slot?: string;
  /** Scroll-driven unveil (progressive enhancement). */
  reveal?: boolean;
  /** Darken the bottom for overlaid text. */
  scrim?: boolean;
  className?: string;
  imgClassName?: string;
}

export function MediaFrame({
  photo,
  ratio,
  sizes,
  priority,
  fallback,
  slot,
  reveal,
  scrim,
  className,
  imgClassName,
}: MediaFrameProps) {
  return (
    <div
      data-media-slot={slot}
      data-accent={fallback.accent}
      className={cx(
        "relative isolate overflow-hidden bg-sunken",
        ratio ? RATIO_CLASS[ratio] : "h-full w-full",
        reveal && "reveal-image",
        className,
      )}
    >
      {photo ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cx("object-cover", imgClassName)}
          style={photo.focal ? { objectPosition: photo.focal } : undefined}
        />
      ) : (
        <Poster {...fallback} />
      )}
      {scrim && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0a0e]/85 via-[#0c0a0e]/25 to-transparent"
        />
      )}
    </div>
  );
}
