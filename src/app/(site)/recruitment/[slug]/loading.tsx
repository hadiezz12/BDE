import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Fiche de poste while it loads: the paper sheet, its head and the sticky ticket. */
export default function CampaignLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement de la fiche de recrutement…" />
      <div className="wrap pb-5 pt-6 sm:pt-8">
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="mx-auto w-full max-w-[var(--wrap)] sm:px-[var(--gutter)]">
        <div data-surface="paper" className="grain sm:rounded-sm">
          <div className="px-[var(--gutter)] sm:px-8 lg:px-12 xl:px-16">
            <div className="grid gap-x-12 gap-y-9 border-b-2 border-fg pb-10 pt-10 sm:pt-12 lg:grid-cols-12">
              <div className="flex flex-col gap-6 lg:col-span-7">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-12 w-4/5" />
                <SkeletonText lines={3} className="max-w-2xl" />
                <div className="grid grid-cols-3 gap-4 border-t-2 border-line pt-3">
                  <Skeleton className="h-10 w-12" />
                  <Skeleton className="h-10 w-12" />
                  <Skeleton className="h-10 w-20" />
                </div>
              </div>
              <Skeleton className="aspect-[3/2] w-full lg:col-span-5" />
            </div>
            <div className="grid gap-x-12 gap-y-12 py-10 sm:py-14 lg:grid-cols-12">
              <div className="flex flex-col gap-10 lg:col-span-8">
                <Skeleton className="h-8 w-48" />
                {[0, 1].map((i) => (
                  <div key={i} className="flex flex-col gap-5 border-t border-line pt-8">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-2/3" />
                    <SkeletonText lines={2} />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))}
              </div>
              <div className="hidden lg:col-span-4 lg:block">
                <Skeleton className="h-80 w-full rounded-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
