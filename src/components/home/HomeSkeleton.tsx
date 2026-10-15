import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { HomeHeadline } from "./HomeHeadline";

/**
 * Home skeleton, the Suspense fallback of the home page (a loading.tsx in
 * app/(site) would also cover every sibling route). The headline needs no
 * data, so it is the real one with its neon tube unlit: when the page
 * arrives, the sign switches on. Everything else is a stand-in of the same
 * size: the pitch and its two buttons, the visual, the ticker, the personal
 * line and the programme board of the 8 events.
 */
export function HomeSkeleton() {
  return (
    <>
      <LoadingAnnouncement label="Chargement de l'accueil…" />

      <div className="wrap grid gap-x-8 gap-y-10 pb-12 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-y-12 lg:pb-16 lg:pt-16">
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-span-7 lg:row-start-1 lg:self-center">
          <Skeleton className="h-3 w-72 max-w-full" />
          <HomeHeadline state="off" />
          <SkeletonText lines={3} className="max-w-xl" />
          <div aria-hidden className="mt-1 flex flex-wrap gap-3">
            <Skeleton className="h-14 w-60" />
            <Skeleton className="h-14 w-44" />
          </div>
        </div>

        <div aria-hidden className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
          <Skeleton className="aspect-[16/10] w-full sm:aspect-[3/2] lg:aspect-[4/5]" />
        </div>
      </div>

      <div aria-hidden className="flex gap-10 overflow-hidden border-y border-line py-5 pl-[var(--gutter)]">
        {["w-72", "w-96", "w-64", "w-80"].map((w, i) => (
          <Skeleton key={i} className={`h-8 shrink-0 ${w}`} />
        ))}
      </div>

      <div aria-hidden className="wrap pt-8 sm:pt-10">
        <Skeleton className="h-14 w-full" />
      </div>

      <div aria-hidden className="wrap py-section">
        <span className="flex flex-col gap-4 border-t-2 border-line-strong pt-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-80 max-w-full" />
        </span>
        <div className="mt-10 grid grid-cols-2 border-l border-t border-line lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="flex flex-col gap-4 border-b border-r border-line p-4 sm:p-6">
              <Skeleton className="size-[4.5rem] rounded-full sm:size-24" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
