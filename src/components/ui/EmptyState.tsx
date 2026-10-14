import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Empty states say what is empty, why that's normal, and what to do next.
 * No generic "Nothing here yet!" — callers pass a specific title and action.
 * Layout is left-aligned with a ruled top, like a note pinned to the page.
 */
export function EmptyState({
  title,
  children,
  actions,
  mark,
  tone = "default",
  className,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Optional big glyph/number/emblem on the left (e.g. "0", an emblem). */
  mark?: ReactNode;
  tone?: "default" | "quiet";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-5 border-t-2 border-line-strong pt-6 sm:flex-row sm:items-start sm:gap-8",
        tone === "quiet" && "border-line",
        className,
      )}
    >
      {mark && <div className="shrink-0 text-accent-text">{mark}</div>}
      <div className="flex max-w-xl flex-col gap-3">
        <h3 className="type-card text-[1.35rem]">{title}</h3>
        {children && <div className="text-muted">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}
