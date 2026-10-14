import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { EventPosterSkeleton, EventRowSkeleton } from "@/components/events/EventSkeletons";
import { HomeHeadline } from "./HomeHeadline";

/**
 * Home skeleton, the Suspense fallback of the home page (a loading.tsx in
 * app/(site) would also cover every sibling route). The headline needs no
 * data, so it is the real one with its neon tube unlit: when the page
 * arrives, the sign switches on. Everything that depends on the agenda is a
 * stand-in of the same size.
 */
export function HomeSkeleton() {
  return (
    <>
      <LoadingAnnouncement label="Chargement de l'accueil…" />

      <div className="wrap grid gap-x-8 gap-y-10 pb-12 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-y-12 lg:pb-16 lg:pt-16">
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-span-7 lg:row-start-1">
          <Skeleton className="h-3 w-56" />
          <HomeHeadline state="off" />
          <SkeletonText lines={2} className="max-w-xl" />
        </div>

        <div aria-hidden className="min-w-0 lg:col-span-7 lg:row-start-2">
          <span className="flex flex-col gap-4 border-t-2 border-line-strong pt-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-40" />
          </span>
          <span className="mt-4 block border-b border-line">
            {[0, 1, 2].map((i) => (
              <EventRowSkeleton key={i} variant="compact" />
            ))}
          </span>
        </div>

        <div aria-hidden className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Skeleton className="aspect-[16/10] w-full sm:aspect-[3/2] lg:aspect-[4/5]" />
          <Skeleton className="mt-3 h-4 w-2/3" />
        </div>
      </div>

      <div aria-hidden className="flex gap-10 overflow-hidden border-y border-line py-5 pl-[var(--gutter)]">
        {["w-72", "w-96", "w-64", "w-80"].map((w, i) => (
          <Skeleton key={i} className={`h-7 shrink-0 ${w}`} />
        ))}
      </div>

      <div aria-hidden className="wrap pb-section pt-section">
        <span className="flex flex-col gap-4 border-t-2 border-line-strong pt-3">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-8 w-56" />
        </span>
        <span className="mt-8 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <EventPosterSkeleton key={i} className="w-[17.5rem] shrink-0 sm:w-[19rem]" />
          ))}
        </span>
      </div>
    </>
  );
}
