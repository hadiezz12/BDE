import { LoadingAnnouncement, Skeleton } from "@/components/ui/Skeleton";
import { SeriesRowSkeleton } from "@/components/events/EventSkeletons";

/** Agenda while it loads: poster header, then the programme of the 8 events of the year. */
export default function EventsLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement de l'agenda…" />
      <div className="wrap pb-8 pt-10 sm:pt-16">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[clamp(2.3rem,1rem+5.4vw,6.25rem)] w-3/5" />
          </div>
          <div className="flex flex-col gap-3 lg:col-span-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
      <div className="wrap">
        <Skeleton className="h-0.5 w-full" />
        <Skeleton className="mt-4 h-3 w-32" />
        <Skeleton className="mt-4 h-8 w-72 max-w-full" />
        <div className="mt-6 border-b border-line-strong">
          {[0, 1, 2, 3].map((i) => (
            <SeriesRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
