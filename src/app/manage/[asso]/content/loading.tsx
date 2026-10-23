import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Shaped like the content desk: header, the step tabs, then rows with their
 * cover thumbnail. Also the fallback of the desk's sub-pages that have no
 * loading state of their own (rules, editor), hence the neutral label.
 */
export default function ManageContentLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingAnnouncement label="Chargement des contenus…" />
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <SkeletonText lines={1} className="w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex gap-5 overflow-hidden border-b border-line pb-3">
          {["w-10", "w-20", "w-16", "w-20", "w-16", "w-16"].map((w, i) => (
            <Skeleton key={i} className={`h-4 shrink-0 ${w}`} />
          ))}
        </div>
        <div className="divide-y divide-line rounded-md border border-line bg-raised">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="aspect-[4/3] w-16 shrink-0 rounded-xs" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="hidden h-3 w-28 md:block" />
              <Skeleton className="hidden h-3 w-20 xl:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
