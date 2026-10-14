import Link from "next/link";
import type { ReactNode } from "react";
import type { AssociationRef } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { AssociationLogo } from "./AssociationLogo";

/**
 * Compact association line: mark, name, one line of context, an optional
 * short fact on the right, an arrow. Used in side lists, search results, the
 * student's memberships and rails.
 *
 *  - default : a ruled row (top rule that lights up in the accent on hover),
 *              for vertical lists — wrap several in a <ul>/<li>.
 *  - boxed   : a bordered slip with a fixed width set by the caller, for rails.
 *
 * The whole row is one link (stretched from the name), so `detail` and
 * `aside` must not contain links or buttons.
 */
export function AssociationRow({
  association,
  detail,
  aside,
  href,
  as: Tag = "h3",
  size = "md",
  boxed,
  arrow = true,
  className,
}: {
  association: AssociationRef;
  /**
   * Second line. Defaults to the association's kind ("Bureau des sports").
   * Memberships pass the role, search passes its context line.
   */
  detail?: ReactNode;
  /** Short fact before the arrow: a StatusBadge ("Recrute"), a mono count. */
  aside?: ReactNode;
  /** Defaults to the public profile; the workspace passes routes.manageHome(slug). */
  href?: string;
  /** Heading level of the name, or "p" in lists that sit under no heading of their own. */
  as?: "h2" | "h3" | "h4" | "p";
  size?: "sm" | "md";
  boxed?: boolean;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <div
      data-accent={association.accent}
      className={cx(
        "group focus-ring-within relative flex items-center",
        size === "sm" ? "gap-2.5" : "gap-3.5",
        boxed
          ? "rounded-sm border border-line-strong bg-raised px-4 py-3.5 transition-colors duration-200 hover:border-assoc"
          : cx("border-t border-line", size === "sm" ? "py-2.5" : "py-3.5"),
        className,
      )}
    >
      {!boxed && (
        <span
          aria-hidden
          className="absolute -top-px left-0 h-0.5 w-full origin-left scale-x-0 bg-assoc transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
        />
      )}

      <AssociationLogo association={association} size={size === "sm" ? 32 : 44} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Tag
          className={cx(
            "font-bold leading-tight break-words",
            size === "sm" ? "text-[0.95rem]" : "text-[1.0625rem]",
          )}
        >
          <Link
            href={href ?? routes.association(association.slug)}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
          >
            {association.name}
          </Link>
        </Tag>
        <div className={cx("line-clamp-2 text-muted", size === "sm" ? "text-[0.8125rem] leading-snug" : "type-small")}>
          {detail ?? association.kind}
        </div>
      </div>

      {aside && <div className="shrink-0 text-right">{aside}</div>}

      {arrow && (
        <Icon
          name="arrow-right"
          size={size === "sm" ? 16 : 18}
          className="shrink-0 text-assoc-text transition-transform group-hover:translate-x-0.5"
        />
      )}
    </div>
  );
}

/** Same footprint as a default AssociationRow, for loading.tsx. */
export function AssociationRowSkeleton({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const logo = size === "sm" ? "size-8" : "size-11";
  return (
    <div
      aria-hidden
      className={cx("flex items-center gap-3.5 border-t border-line", size === "sm" ? "py-2.5" : "py-3.5", className)}
    >
      <Skeleton className={cx("shrink-0 rounded-full", logo)} />
      <span className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </span>
    </div>
  );
}
