import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Shaped like the new-post form: header, the four type tiles, the title field. */
export default function NewPostLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingAnnouncement label="Chargement…" />
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <SkeletonText lines={2} className="w-full max-w-xl" />
      </div>
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-sm" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-12 rounded-sm" />
        </div>
        <Skeleton className="h-11 w-48 rounded-sm" />
      </div>
    </div>
  );
}
