import { LoadingAnnouncement, Skeleton } from "@/components/ui/Skeleton";

/** Recruitment index while campaigns load: poster header, then rows shaped like CampaignRow. */
export default function RecruitmentLoading() {
  return (
    <div className="pb-[var(--section)]">
      <LoadingAnnouncement label="Chargement des recrutements…" />
      <div className="wrap pb-8 pt-10 sm:pt-16">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-[clamp(2.3rem,1rem+5.4vw,6.25rem)] w-4/5" />
          </div>
          <div className="flex flex-col gap-3 lg:col-span-4">
            <Skeleton className="h-7 w-40 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="mt-10 flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="wrap pt-12">
        <Skeleton className="h-0.5 w-full" />
        <Skeleton className="mt-4 h-7 w-64" />
        <div className="mt-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr] items-end gap-x-6 gap-y-5 border-t border-line py-8 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]"
            >
              <div className="col-span-2 flex flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-9 w-3/4" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-7 w-20" />
                </div>
              </div>
              <Skeleton className="h-16 w-24 sm:col-start-1 sm:row-start-1 sm:h-20" />
              <Skeleton className="h-11 w-11 justify-self-end sm:w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
