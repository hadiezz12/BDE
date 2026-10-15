import { EventPosterSkeleton, EventRowSkeleton } from "@/components/events/EventSkeletons";
import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** An association's page while it loads: cover and mark, name, facts, then the first sections. */
export default function AssociationLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement de la page de l'association…" />
      <div aria-hidden>
        <div className="wrap pb-5 pt-6 sm:pt-8">
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="wrap">
          <div className="relative">
            <Skeleton className="aspect-[4/5] w-full rounded-none max-sm:mx-[calc(var(--gutter)*-1)] max-sm:w-auto sm:aspect-[16/9] lg:aspect-[21/9]" />
            <span className="absolute bottom-0 left-0 block size-[7.25rem] translate-y-1/2 rounded-full border-[0.375rem] border-bg bg-raised sm:left-6 lg:left-10" />
          </div>
        </div>

        <div className="wrap grid gap-x-12 gap-y-10 pt-20 lg:grid-cols-12 lg:pt-24">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-[clamp(2.1rem,0.8rem+5.2vw,6.25rem)] w-4/5" />
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="mt-2 h-5 w-3/4" />
          </div>
          <div className="flex flex-col gap-7 lg:col-span-4 lg:col-start-9 lg:pt-6">
            <div className="grid grid-cols-3 gap-3 border-t-2 border-line-strong pt-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-9 w-16" />
                </span>
              ))}
            </div>
            <Skeleton className="h-11 w-48" />
          </div>
        </div>

        <div className="wrap grid gap-x-12 gap-y-14 pt-[var(--section)] lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-7 w-52" />
            <SkeletonText lines={4} />
            <SkeletonText lines={3} />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4 lg:col-start-9">
            <Skeleton className="h-0.5 w-full" />
            <SkeletonText lines={2} />
            <Skeleton className="mt-6 h-0.5 w-full" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>

        <div className="wrap pt-[var(--section)]">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-72" />
          <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-12">
            <EventPosterSkeleton className="sm:max-w-[36rem] lg:col-span-5 lg:max-w-none" />
            <div className="lg:col-span-6 lg:col-start-7">
              {[0, 1, 2].map((i) => (
                <EventRowSkeleton key={i} variant="compact" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
