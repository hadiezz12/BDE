import { AssociationTileSkeleton } from "@/components/associations/AssociationTile";
import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { TILE_GRID, tileLayout } from "./_components/tile-layout";

/** Associations index while it loads: poster header, filters, the BDE band, then the poster wall. */
export default function AssociationsLoading() {
  const tiles = 8;
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement des associations…" />
      <div aria-hidden>
        <div className="wrap pb-8 pt-10 sm:pt-16">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="flex flex-col gap-4 lg:col-span-8">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-[clamp(2.3rem,1rem+5.4vw,6.25rem)] w-4/5" />
            </div>
            <div className="flex flex-col gap-3 lg:col-span-4">
              <Skeleton className="h-7 w-40 rounded-full" />
              <SkeletonText lines={3} />
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-5">
            <Skeleton className="h-12 w-full max-w-xl" />
            <div className="flex gap-2 overflow-hidden">
              {["w-24", "w-16", "w-20", "w-24", "w-16", "w-28"].map((w, i) => (
                <Skeleton key={i} className={`h-10 shrink-0 rounded-sm ${w}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="wrap">
          <Skeleton className="h-16 w-full" />
        </div>

        <div className="wrap pt-12 sm:pt-16">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-56" />
          <div className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-12">
            <AssociationTileSkeleton className="max-md:max-w-[26rem] md:col-span-5 lg:col-span-4" />
            <div className="flex flex-col gap-6 md:col-span-7 lg:col-start-6">
              <SkeletonText lines={4} />
              <div className="flex flex-col">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="flex gap-3 border-t border-line py-4">
                    <Skeleton className="h-7 w-6" />
                    <Skeleton className="h-4 flex-1" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="wrap pt-16 sm:pt-20">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-64" />
          <div className={`mt-8 ${TILE_GRID}`}>
            {Array.from({ length: tiles }, (_, i) => (
              <AssociationTileSkeleton key={i} className={tileLayout(i, tiles).className} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
