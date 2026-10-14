import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Profil while it loads: header, the photo and fields, the margin note. */
export default function AccountProfileLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de ton profil…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-48 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div aria-hidden className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Skeleton className="h-0.5 w-full" />
          <Skeleton className="mt-4 h-7 w-40" />
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Skeleton className="size-22 rounded-full" />
            <SkeletonText lines={2} className="w-full max-w-sm" />
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-12 w-full" />
              </span>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <Skeleton className="h-0.5 w-full" />
          <div className="mt-4 flex flex-col gap-5">
            <SkeletonText lines={3} />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
