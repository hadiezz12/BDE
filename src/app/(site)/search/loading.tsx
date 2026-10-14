import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Same frame as the results page: poster header, the field, then ruled rows. */
export default function SearchLoading() {
  return (
    <div className="wrap pb-section pt-10 sm:pt-16">
      <LoadingAnnouncement label="Recherche en cours…" />
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-[clamp(2.1rem,1rem+5vw,5.75rem)] w-3/4 max-w-xl" />
        </div>
        <SkeletonText lines={2} className="lg:col-span-4 lg:pb-2" />
      </div>
      <Skeleton className="mt-10 h-14 w-full sm:h-16" />

      <div className="mt-14 border-t-2 border-line-strong pt-4">
        <Skeleton className="h-6 w-56" />
        <div className="mt-8 grid gap-4 lg:grid-cols-12 lg:gap-8">
          <Skeleton className="h-14 w-24 lg:col-span-3 lg:h-24" />
          <ul className="lg:col-span-9">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 border-t border-line py-4 sm:gap-5 sm:px-3 sm:py-5">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <span className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
