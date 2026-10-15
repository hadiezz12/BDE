import type { AccentKey, MediaAsset, Photo } from "@/lib/types";
import { formatDayShort } from "@/lib/format";
import { MediaFrame } from "@/components/media/MediaFrame";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * The association's media library as a contact sheet: square thumbnails on
 * hairlines, each with where it is used, who added it and when. Logos and
 * neon emblems (transparent PNGs) are shown whole on ink, as they appear on
 * the site; photos are cropped square around their focal point.
 */

/** Logos and emblems: drawn artwork with transparency, not photographs. */
function isGraphic(photo: Photo): boolean {
  return /\.(png|svg)$/i.test(photo.src);
}

export function MediaGrid({
  assets,
  accent,
  label,
}: {
  assets: MediaAsset[];
  /** Association accent, for the designed fallback. */
  accent: AccentKey;
  /** Accessible name of the list ("Images utilisées de …"). */
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {assets.map((asset) => {
        const graphic = isGraphic(asset.photo);
        return (
          <li key={asset.id} className="border-b border-r border-line bg-raised">
            <figure className="flex h-full flex-col">
              <MediaFrame
                photo={asset.photo}
                ratio="1/1"
                slot="gallery"
                sizes="(min-width: 1280px) 15vw, (min-width: 1024px) 19vw, (min-width: 640px) 30vw, 48vw"
                fallback={{ title: asset.usedIn ?? "Image", accent }}
                className={graphic ? "bg-inverse" : undefined}
                imgClassName={graphic ? "object-contain p-[14%]" : undefined}
              />
              <figcaption className="flex flex-1 flex-col gap-1.5 px-3 py-3">
                {asset.usedIn ? (
                  <span className="type-small font-semibold break-words">{asset.usedIn}</span>
                ) : (
                  <StatusBadge tone="neutral">Utilisée nulle part</StatusBadge>
                )}
                <span className="mt-auto type-small text-muted">Ajoutée par {asset.uploadedBy}</span>
                <span className="type-meta text-[0.72rem] text-subtle">
                  <time dateTime={asset.uploadedAt}>{formatDayShort(asset.uploadedAt)}</time>
                  {` · ${asset.photo.width}×${asset.photo.height}`}
                </span>
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
