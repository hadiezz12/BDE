import Link from "next/link";
import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { Sticker } from "@/components/ui/Sticker";
import { AssociationLogo } from "./AssociationLogo";
import { categoryKicker, type TileSticker } from "./association-facts";

type TileAssociation = Pick<
  Association,
  "slug" | "name" | "shortName" | "kind" | "categories" | "accent" | "logo" | "tagline" | "cover"
>;

/**
 * One association in the index: a vertical poster (the association's cover,
 * or a printed poster in its accent), its mark stuck across the bottom edge
 * like a sticker on a flyer, then category, name, kind and tagline.
 *
 * At most one sticker, and only for a fact the page already knows
 * ("Recrute · 3 places") — the tile never fetches. The whole tile is one link
 * (stretched from the name). Width is the caller's call: grid cell or rail item.
 */
export function AssociationTile({
  association,
  sticker,
  headingLevel = 3,
  sizes = "(min-width: 1280px) 20vw, (min-width: 768px) 30vw, (min-width: 480px) 45vw, 80vw",
  priority,
  className,
}: {
  association: TileAssociation;
  sticker?: TileSticker;
  headingLevel?: 2 | 3 | 4;
  /** next/image sizes hint for the poster; match the grid or rail width. */
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const kicker = categoryKicker(association.categories);

  return (
    <article
      data-accent={association.accent}
      className={cx("group focus-ring-within relative flex flex-col", className)}
    >
      <div className="relative @container">
        <MediaFrame
          photo={association.cover}
          ratio="4/5"
          slot="association-tile"
          sizes={sizes}
          priority={priority}
          fallback={{ title: association.name, accent: association.accent, kicker: association.kind }}
          className="border-2 border-fg transition-colors duration-200 group-hover:border-assoc group-focus-within:border-assoc"
          imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {sticker && (
          // Two tiles side by side on a 360 px phone: the sticker steps down a size.
          <Sticker
            tone={sticker.tone}
            icon={sticker.icon}
            tilt={3}
            className="absolute right-3 top-3 @max-[13rem]:right-2 @max-[13rem]:top-2 @max-[13rem]:text-[0.6rem]"
          >
            {sticker.label}
          </Sticker>
        )}
        {/* The mark, stuck across the poster's bottom edge. */}
        <span className="absolute bottom-0 left-3.5 flex translate-y-1/2 rounded-full border-2 border-sticker-line shadow-sticker">
          <AssociationLogo association={association} size={56} />
        </span>
      </div>

      {/* Kicker shares the line with the lower half of the mark. */}
      <div className="flex min-h-10 items-center justify-end">
        {kicker && <p className="type-label text-assoc-text">{kicker}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <H className="type-card text-[1.3rem] break-words hyphens-auto">
          <Link
            href={routes.association(association.slug)}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
          >
            {association.name}
          </Link>
        </H>
        <p className="type-small font-semibold text-subtle">{association.kind}</p>
        <p className="mt-1.5 line-clamp-3 type-small text-muted">{association.tagline}</p>
      </div>
    </article>
  );
}

/** Same footprint as AssociationTile, for loading.tsx. */
export function AssociationTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("flex flex-col", className)}>
      <div className="relative">
        <Skeleton className="aspect-[4/5] w-full" />
        <span className="absolute bottom-0 left-3.5 block size-[3.75rem] translate-y-1/2 rounded-full border-2 border-line bg-bg" />
      </div>
      <span className="flex min-h-10 items-center justify-end">
        <Skeleton className="h-3 w-14" />
      </span>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-3.5 w-2/5" />
      <SkeletonText lines={2} className="mt-3" />
    </div>
  );
}
