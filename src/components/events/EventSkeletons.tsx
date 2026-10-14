import { cx } from "@/lib/cx";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Loading stand-ins shaped like the real EventRow / EventPoster, for the
 * loading.tsx of data-heavy routes. Decorative: pair them with one
 * LoadingAnnouncement per region.
 */
export function EventRowSkeleton({ variant = "default", className }: { variant?: "default" | "compact"; className?: string }) {
  if (variant === "compact") {
    return (
      <div aria-hidden className={cx("grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3.5 border-t border-line py-3.5", className)}>
        <span className="flex flex-col gap-1.5">
          <Skeleton className="h-2.5 w-6" />
          <Skeleton className="h-7 w-9" />
          <Skeleton className="h-2.5 w-7" />
        </span>
        <span className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </span>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cx(
        "grid gap-x-4 gap-y-3 border-t border-line-strong py-5",
        "grid-cols-[4.25rem_minmax(0,1fr)] sm:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,11.5rem)] sm:gap-x-6 sm:py-6",
        "lg:grid-cols-[6.5rem_minmax(0,6fr)_minmax(0,3.5fr)_minmax(0,3fr)] lg:gap-x-8 lg:py-7",
        className,
      )}
    >
      <span className="flex flex-col gap-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-12 w-14 sm:h-14" />
        <Skeleton className="h-3 w-9" />
      </span>
      <span className="flex flex-col gap-3">
        <span className="flex items-center gap-2.5">
          <Skeleton className="size-[22px] rounded-full" />
          <Skeleton className="h-3 w-28" />
        </span>
        <Skeleton className="h-6 w-4/5" />
        <SkeletonText lines={2} className="max-w-56 lg:hidden" />
      </span>
      <SkeletonText lines={3} className="hidden pt-1 lg:flex" />
      <span className="hidden flex-col gap-2 pt-1 sm:flex">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </span>
    </div>
  );
}

export function EventPosterSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("flex flex-col overflow-hidden rounded-sm border border-line", className)}>
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <span className="flex gap-3 p-4">
        <span className="flex w-12 shrink-0 flex-col items-center gap-2">
          <Skeleton className="h-3 w-7" />
          <Skeleton className="h-12 w-11" />
          <Skeleton className="h-3 w-8" />
        </span>
        <span className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <SkeletonText lines={2} />
        </span>
      </span>
      <span className="flex flex-col gap-2 border-t border-line px-4 py-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-28" />
      </span>
    </div>
  );
}
