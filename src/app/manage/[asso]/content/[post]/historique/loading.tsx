import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Shaped like the history: page header, the version cards, the review timeline beside them. */
export default function PostHistoryLoading() {
  return (
    <div className="flex flex-col gap-10">
      <LoadingAnnouncement label="Chargement de l'historique…" />
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <SkeletonText lines={1} className="w-full max-w-md" />
      </div>
      <div className="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-3/5" />
              <SkeletonText lines={3} className="max-w-md" />
              <Skeleton className="h-9 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <SkeletonText lines={5} />
        </div>
      </div>
    </div>
  );
}
