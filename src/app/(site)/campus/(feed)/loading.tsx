import { FeedHeader } from "@/components/campus/FeedHeader";
import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Feed skeleton. The masthead is the real one (it needs no data), so
 * switching rubrique only redraws the stories underneath.
 */
export default function CampusFeedLoading() {
  return (
    <>
      <LoadingAnnouncement label="Chargement du fil du campus…" />
      <FeedHeader>
        <div className="flex gap-2 overflow-hidden">
          {["w-16", "w-24", "w-28", "w-28", "w-24", "w-20"].map((w, i) => (
            <Skeleton key={i} className={`h-10 shrink-0 rounded-sm ${w}`} />
          ))}
        </div>
      </FeedHeader>

      <div aria-hidden className="wrap grid gap-x-10 gap-y-14 pb-section lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <span className="block border-t-2 border-line-strong pt-3">
            <Skeleton className="h-3 w-24" />
          </span>
          <Skeleton className="aspect-[3/2] w-full max-sm:mx-[calc(var(--gutter)*-1)] max-sm:w-auto" />
          <Skeleton className="h-3 w-40" />
          <span className="flex flex-col gap-3">
            <Skeleton className="h-10 w-11/12 sm:h-14" />
            <Skeleton className="h-10 w-3/4 sm:h-14" />
          </span>
          <SkeletonText lines={2} className="max-w-3xl" />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4 lg:border-l lg:border-line lg:pl-10">
          <span className="block border-t-2 border-line-strong pt-3">
            <Skeleton className="h-3 w-20" />
          </span>
          <Skeleton className="h-7 w-32" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-2 border-b border-line py-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden className="wrap grid gap-10 pb-section md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[3/2] w-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
            <SkeletonText lines={2} />
          </span>
        ))}
      </div>
    </>
  );
}
