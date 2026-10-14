import { LoadingAnnouncement, Skeleton } from "@/components/ui/Skeleton";
import { EventRowSkeleton } from "@/components/events/EventSkeletons";

/** Agenda while it loads: poster header, two chip rows, then a day group of rows. */
export default function EventsLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement de l'agenda…" />
      <div className="wrap pb-8 pt-10 sm:pt-16">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-[clamp(2.3rem,1rem+5.4vw,6.25rem)] w-3/5" />
          </div>
          <div className="flex flex-col gap-3 lg:col-span-4">
            <Skeleton className="h-7 w-44 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4">
          {[4, 6].map((n) => (
            <div key={n} className="flex gap-2 overflow-hidden">
              {Array.from({ length: n }, (_, i) => (
                <Skeleton key={i} className="h-10 w-24 shrink-0" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="wrap">
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="wrap pt-12 sm:pt-16">
        <Skeleton className="h-0.5 w-full" />
        <Skeleton className="mt-4 h-3 w-56" />
        <Skeleton className="mt-4 h-8 w-48" />
        <div className="mt-6 border-b border-line-strong">
          {[0, 1, 2, 3].map((i) => (
            <EventRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
