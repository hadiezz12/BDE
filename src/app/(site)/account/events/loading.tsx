import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { EventRowSkeleton } from "@/components/events/EventSkeletons";

/** Mes événements while it loads: header, a ticket, agenda rows, the past column. */
export default function AccountEventsLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de tes événements…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-80 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div aria-hidden className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="lg:col-span-8 lg:row-start-1">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-48" />
          <div className="mt-8 grid grid-cols-[5.25rem_minmax(0,1fr)] border-2 border-line sm:grid-cols-[7.5rem_minmax(0,1fr)]">
            <Skeleton className="h-full min-h-44 rounded-none" />
            <span className="flex flex-col gap-3 p-4 sm:p-6">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-7 w-4/5" />
              <SkeletonText lines={3} className="max-w-72" />
            </span>
          </div>
        </div>
        <div className="lg:col-span-12 lg:row-start-2">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-44" />
          <div className="mt-6">
            <EventRowSkeleton />
            <EventRowSkeleton />
            <EventRowSkeleton />
          </div>
        </div>
        <div className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-40" />
          <div className="mt-6">
            <EventRowSkeleton variant="compact" />
            <EventRowSkeleton variant="compact" />
          </div>
        </div>
      </div>
    </div>
  );
}
