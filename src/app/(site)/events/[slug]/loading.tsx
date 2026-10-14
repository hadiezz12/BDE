import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { EventPosterSkeleton } from "@/components/events/EventSkeletons";

/** Event page while it loads: the poster hero with its ticket strip, the body and the sticky panel. */
export default function EventLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement de l'événement…" />
      <div className="wrap pb-5 pt-6 sm:pt-8">
        <Skeleton className="h-3 w-56" />
      </div>

      <div className="wrap grid gap-x-12 gap-y-7 lg:grid-cols-12 lg:items-end">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[clamp(2.2rem,1rem+4.8vw,5.5rem)] w-11/12" />
            <Skeleton className="h-[clamp(2.2rem,1rem+4.8vw,5.5rem)] w-2/3" />
            <Skeleton className="mt-1 h-5 w-3/4" />
          </div>
          <div className="flex gap-4 border-y-2 border-line py-5">
            <span className="flex w-[6.25rem] shrink-0 flex-col items-center gap-2 sm:w-[8rem]">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-16 w-16 sm:h-20" />
              <Skeleton className="h-3 w-10" />
            </span>
            <span className="flex flex-1 flex-col gap-5">
              <SkeletonText lines={2} />
              <SkeletonText lines={2} />
              <Skeleton className="h-3.5 w-1/2" />
            </span>
          </div>
        </div>
        <Skeleton className="order-first -mx-[var(--gutter)] aspect-video rounded-none sm:mx-0 sm:rounded-sm lg:order-none lg:col-span-5 lg:aspect-[4/5] lg:max-h-[min(44rem,78vh)]" />
      </div>

      <div className="wrap grid gap-x-12 gap-y-14 pt-12 sm:pt-16 lg:grid-cols-12">
        <div className="flex flex-col gap-10 lg:col-span-8">
          <Skeleton className="h-72 w-full rounded-sm lg:hidden" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-8 w-48" />
            <SkeletonText lines={4} className="max-w-[44rem]" />
            <SkeletonText lines={3} className="max-w-[44rem]" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-8 w-56" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-full max-w-[40rem]" />
            ))}
          </div>
        </div>
        <div className="hidden lg:col-span-4 lg:block">
          <Skeleton className="h-[26rem] w-full rounded-sm" />
        </div>
      </div>

      <div className="wrap pt-[var(--section)]">
        <Skeleton className="h-0.5 w-full" />
        <Skeleton className="mt-4 h-8 w-64" />
        <div className="mt-8 flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <EventPosterSkeleton key={i} className="w-[17.5rem] shrink-0 sm:w-[19rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}
