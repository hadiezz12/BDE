import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Event page while it loads (an event of the year or a dated edition): the
 * hero with its facts strip and visual, the body, the side panel.
 */
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
            <Skeleton className="mt-1 h-5 w-3/4" />
          </div>
          <div className="flex flex-col divide-y divide-line border-y-2 border-line">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex gap-4 py-4">
                <Skeleton className="h-3 w-14 shrink-0" />
                <Skeleton className="h-4 w-2/3" />
              </span>
            ))}
          </div>
        </div>
        <Skeleton className="order-first -mx-[var(--gutter)] aspect-video rounded-none sm:mx-0 sm:rounded-sm lg:order-none lg:col-span-5 lg:aspect-[4/5] lg:max-h-[min(44rem,78vh)]" />
      </div>

      <div className="wrap grid gap-x-12 gap-y-14 pt-12 sm:pt-16 lg:grid-cols-12">
        <div className="flex flex-col gap-10 lg:col-span-8">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-8 w-48" />
            <SkeletonText lines={3} className="max-w-[44rem]" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-8 w-56" />
            <SkeletonText lines={2} className="max-w-[40rem]" />
          </div>
        </div>
        <div className="lg:col-span-4">
          <Skeleton className="h-72 w-full rounded-sm" />
        </div>
      </div>
    </div>
  );
}
