import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Shaped like the post editor: the header line, the phone panel switch, the
 * formatting bar over the paper sheet (title, introduction, text), and the
 * side column (publication, settings).
 */
export default function PostEditorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingAnnouncement label="Ouverture de l'article…" />
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-[3.25rem] w-full rounded-md xl:hidden" />
      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-1 overflow-hidden border-b border-line py-1">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="size-11 shrink-0 rounded-sm" />
            ))}
          </div>
          <div className="flex flex-col gap-8 rounded-md border border-line px-5 py-6 max-sm:mx-[calc(var(--gutter)*-1)] max-sm:rounded-none max-sm:border-x-0 sm:px-8 sm:py-9 2xl:px-12 2xl:py-12">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-9 w-4/5" />
              <Skeleton className="h-9 w-3/5" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <SkeletonText lines={2} className="max-w-xl" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-12" />
              <SkeletonText lines={6} className="max-w-[40rem]" />
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-10 xl:flex">
          {[5, 7].map((lines, i) => (
            <div key={i} className="flex flex-col gap-4">
              <Skeleton className="h-4 w-28" />
              <SkeletonText lines={lines} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
