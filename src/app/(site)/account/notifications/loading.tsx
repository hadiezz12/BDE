import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Notifications while they load: header, the toolbar, a day of ruled lines. */
export default function AccountNotificationsLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de tes notifications…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-72 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div aria-hidden className="wrap">
        <div className="max-w-3xl">
          <div className="flex items-center justify-between gap-6 border-y-2 border-line py-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-10 w-48 max-w-[45%]" />
          </div>
          <Skeleton className="mt-8 h-3 w-28" />
          <div className="mt-3 border-b border-line">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 border-t border-line py-4 pl-4 sm:pl-5">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-4.5 w-3/4" />
                <SkeletonText lines={1} className="max-w-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
