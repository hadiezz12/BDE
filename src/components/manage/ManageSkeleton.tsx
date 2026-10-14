import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Loading placeholder shaped like a workspace page (header, optional KPI band,
 * rows). For loading.tsx files under /manage/[asso]/…; it renders inside the
 * workspace main, so the nav stays usable while the page loads.
 */
export function ManageSkeleton({
  label = "Chargement de la page…",
  stats = 0,
  rows = 6,
}: {
  label?: string;
  /** Number of KPI tiles to sketch (0 = none). */
  stats?: 0 | 2 | 3 | 4;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <LoadingAnnouncement label={label} />
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <SkeletonText lines={1} className="w-full max-w-md" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 bg-raised px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-16" />
            </div>
          ))}
        </div>
      )}
      <div className="divide-y divide-line rounded-md border border-line bg-raised">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="ml-auto hidden h-3 w-24 md:block" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
