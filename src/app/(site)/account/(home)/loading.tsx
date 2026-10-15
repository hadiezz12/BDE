import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { ApplicationRowSkeleton } from "@/components/account/ApplicationRow";

/** "Mon espace" while it loads: hello, ticket, card, then the two lists. */
export default function AccountHomeLoading() {
  return (
    <div className="wrap pt-8 sm:pt-12">
      <LoadingAnnouncement label="Chargement de ton espace…" />
      <div aria-hidden className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7 lg:row-start-1">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-2/3" />
          <SkeletonText lines={2} className="max-w-xl" />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-7 lg:row-start-2">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="h-6 w-60" />
          <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] border-2 border-line sm:grid-cols-[7.5rem_minmax(0,1fr)]">
            <Skeleton className="h-full min-h-40 rounded-none" />
            <span className="flex flex-col gap-3 p-4 sm:p-6">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-7 w-4/5" />
              <SkeletonText lines={2} className="max-w-64" />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mx-auto aspect-[1.586] w-full max-w-[28rem] rounded-lg lg:mx-0" />
        </div>
      </div>
      <div aria-hidden className="mt-[var(--section)] grid gap-x-8 gap-y-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-56" />
          <div className="mt-6">
            <ApplicationRowSkeleton />
            <ApplicationRowSkeleton />
          </div>
        </div>
        <div className="lg:col-span-5">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-48" />
          <div className="mt-6 flex flex-col gap-5">
            <SkeletonText lines={3} />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
