import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** One application while it loads: header, next-step ticket, timeline, the margin. */
export default function AccountApplicationLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de ta candidature…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-10 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-64 max-w-full" />
        <span className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-36" />
        </span>
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-72 max-w-full" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      <div aria-hidden className="wrap grid gap-x-8 gap-y-14 lg:grid-cols-12">
        <div className="flex flex-col gap-14 lg:col-span-8">
          <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] border-2 border-line sm:grid-cols-[7rem_minmax(0,1fr)]">
            <Skeleton className="h-full min-h-36 rounded-none" />
            <span className="flex flex-col gap-3 p-4 sm:p-6">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-3/5" />
              <Skeleton className="h-3 w-40" />
            </span>
          </div>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-7 w-72 max-w-full" />
            {[0, 1, 2].map((i) => (
              <span key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4">
                <Skeleton className="size-7 rounded-full" />
                <SkeletonText lines={2} className="max-w-md" />
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 border-2 border-line p-5 lg:col-span-4 lg:self-start">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={3} />
        </div>
      </div>
    </div>
  );
}
