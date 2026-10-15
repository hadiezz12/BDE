import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { ApplicationRowSkeleton } from "@/components/account/ApplicationRow";

/** Mes candidatures while it loads: header, rows, the legend in the margin. */
export default function AccountApplicationsLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de tes candidatures…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-96 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div aria-hidden className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-40" />
          <div className="mt-6">
            <ApplicationRowSkeleton />
            <ApplicationRowSkeleton />
            <ApplicationRowSkeleton />
          </div>
        </div>
        <div className="flex flex-col gap-4 border-2 border-line p-5 lg:col-span-4 lg:self-start">
          <Skeleton className="h-3 w-48" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
