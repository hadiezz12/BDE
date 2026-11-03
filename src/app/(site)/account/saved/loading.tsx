import { LoadingAnnouncement, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Enregistrés while it loads: header, the filter row, a few rows. */
export default function SavedLoading() {
  return (
    <div>
      <LoadingAnnouncement label="Chargement de tes enregistrements…" />
      <div aria-hidden className="wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[clamp(1.9rem,1.1rem+3vw,3.4rem)] w-72 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div aria-hidden className="wrap flex flex-col gap-8">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
        <ul className="border-b border-line">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-start gap-4 border-t border-line py-5">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
