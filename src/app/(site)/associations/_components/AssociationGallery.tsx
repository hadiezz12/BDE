import type { AccentKey, Photo } from "@/lib/types";
import { cx } from "@/lib/cx";
import { MediaFrame } from "@/components/media/MediaFrame";

/**
 * The association's photos as a contact sheet of mixed formats: groups of
 * three (one big frame, two stacked) or two (narrow + wide), mirrored from
 * one group to the next. Frames crop through MediaFrame ("gallery" slot), so
 * landscape and portrait shots both fit; a portrait goes to a narrow frame
 * when there is one. Not links: there is nothing behind a photo.
 *
 * Phone: two columns, the big frame across both. Desktop: 12 columns with
 * fixed-height rows so every group closes flush.
 */

type Shape = "trio-a" | "trio-b" | "duo-a" | "duo-b" | "solo";

const FRAMES: Record<Shape, { className: string; sizes: string }[]> = {
  "trio-a": [
    { className: "col-span-2 row-span-2 lg:col-span-7 lg:col-start-1 lg:row-span-4 lg:row-start-1", sizes: "(min-width: 1024px) 55vw, 100vw" },
    { className: "row-span-2 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1", sizes: "(min-width: 1024px) 40vw, 50vw" },
    { className: "row-span-2 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-3", sizes: "(min-width: 1024px) 40vw, 50vw" },
  ],
  "trio-b": [
    { className: "col-span-2 row-span-2 lg:col-span-7 lg:col-start-6 lg:row-span-4 lg:row-start-1", sizes: "(min-width: 1024px) 55vw, 100vw" },
    { className: "row-span-2 lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-1", sizes: "(min-width: 1024px) 40vw, 50vw" },
    { className: "row-span-2 lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-3", sizes: "(min-width: 1024px) 40vw, 50vw" },
  ],
  "duo-a": [
    { className: "row-span-2 lg:col-span-4 lg:row-span-4", sizes: "(min-width: 1024px) 33vw, 50vw" },
    { className: "row-span-2 lg:col-span-8 lg:row-span-4", sizes: "(min-width: 1024px) 66vw, 50vw" },
  ],
  "duo-b": [
    { className: "row-span-2 lg:col-span-8 lg:row-span-4", sizes: "(min-width: 1024px) 66vw, 50vw" },
    { className: "row-span-2 lg:col-span-4 lg:row-span-4", sizes: "(min-width: 1024px) 33vw, 50vw" },
  ],
  solo: [{ className: "col-span-2 row-span-2 lg:col-span-9 lg:row-span-4", sizes: "(min-width: 1024px) 75vw, 100vw" }],
};

const isPortrait = (p: Photo) => p.height > p.width;

/** 1 → [1] · 2 → [2] · 3 → [3] · 4 → [2,2] · 5 → [3,2] · 6 → [3,3] · 7 → [3,2,2]… */
function groupSizes(n: number): number[] {
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    if (left === 4) {
      sizes.push(2, 2);
      left = 0;
    } else if (left > 3) {
      sizes.push(3);
      left -= 3;
    } else {
      sizes.push(left);
      left = 0;
    }
  }
  return sizes;
}

/** Order a group's photos so portraits land in narrow frames, landscapes in the big one. */
function arrange(group: Photo[], shape: Shape): Photo[] {
  if (shape.startsWith("trio")) {
    const big = group.find((p) => !isPortrait(p)) ?? group[0];
    return [big, ...group.filter((p) => p !== big)];
  }
  if (shape === "duo-a" || shape === "duo-b") {
    const narrowFirst = shape === "duo-a";
    const portrait = group.find(isPortrait);
    if (!portrait) return group;
    const other = group.find((p) => p !== portrait)!;
    return narrowFirst ? [portrait, other] : [other, portrait];
  }
  return group;
}

/** Photos cut into groups, each with its shape (mirrored from one group to the next). */
function layoutGroups(photos: Photo[]): { shape: Shape; group: Photo[] }[] {
  const out: { shape: Shape; group: Photo[] }[] = [];
  let start = 0;
  groupSizes(photos.length).forEach((size, gi) => {
    const shape: Shape =
      size === 3 ? (gi % 2 === 0 ? "trio-a" : "trio-b") : size === 2 ? (gi % 2 === 0 ? "duo-a" : "duo-b") : "solo";
    out.push({ shape, group: arrange(photos.slice(start, start + size), shape) });
    start += size;
  });
  return out;
}

export function AssociationGallery({
  photos,
  name,
  accent,
  className,
}: {
  photos: Photo[];
  /** Association name, for the designed fallback. */
  name: string;
  accent: AccentKey;
  className?: string;
}) {
  if (!photos.length) return null;
  const groups = layoutGroups(photos);
  const credits = [...new Set(photos.map((p) => p.credit).filter((c): c is string => Boolean(c)))];

  return (
    <div className={cx("flex flex-col gap-3 lg:gap-4", className)}>
      {groups.map(({ shape, group }, gi) => (
        <div
          key={gi}
          className="grid auto-rows-[7.25rem] grid-cols-2 gap-3 sm:auto-rows-[10rem] lg:auto-rows-[clamp(6.5rem,8.5vw,8.75rem)] lg:grid-cols-12 lg:gap-4"
        >
          {group.map((photo, i) => (
            <MediaFrame
              key={photo.src}
              photo={photo}
              slot="gallery"
              sizes={FRAMES[shape][i].sizes}
              fallback={{ title: name, accent }}
              className={cx("border-2 border-fg", FRAMES[shape][i].className)}
            />
          ))}
        </div>
      ))}
      {credits.length > 0 && <p className="type-caption">Photos : {credits.join(", ")}.</p>}
    </div>
  );
}
