import { cx } from "@/lib/cx";

/** Placeholder block. Size it like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block", className)} />;
}

/** Lines of text-shaped skeleton; the last one is shorter, like real copy. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cx("skeleton block h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** Visually hidden status for assistive tech while a region loads. */
export function LoadingAnnouncement({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}
