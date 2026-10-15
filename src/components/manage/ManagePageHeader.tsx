import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Opener of every workspace page: the page's h1 (uppercase section voice),
 * one line saying what the page is for, and the primary action on the right
 * (stacked under the title on phones).
 */
export function ManagePageHeader({
  title,
  kicker,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  /** Small running head above the title, e.g. the association short name. Shown in its accent. */
  kicker?: ReactNode;
  description?: ReactNode;
  /** Mono facts under the description ("3 brouillons · dernière publication hier"). */
  meta?: ReactNode;
  /** Primary action (and at most one secondary): ButtonLink, DemoActionButton… */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        {kicker && <p className="type-label text-assoc-text">{kicker}</p>}
        <h1 className="type-section">{title}</h1>
        {description && <div className="max-w-2xl text-muted">{description}</div>}
        {meta && <div className="flex flex-wrap gap-x-5 gap-y-1 type-meta text-subtle">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2.5 sm:shrink-0 sm:justify-end">{actions}</div>}
    </header>
  );
}

/**
 * A block inside a workspace page: ruled head (h2 + optional count and
 * action), then content. Keeps headings in order under ManagePageHeader's h1.
 */
export function ManageSection({
  title,
  count,
  action,
  description,
  children,
  className,
}: {
  title: ReactNode;
  /** Mono number after the title ("14"). */
  count?: number;
  /** A link or small button aligned right on the head line. */
  action?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <div className="flex min-h-9 flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 border-fg pb-2">
        <h2 id={id} className="flex items-baseline gap-2.5 type-button text-[0.95rem]">
          {title}
          {count !== undefined && <span className="type-meta text-subtle normal-case">{count}</span>}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {description && <div className="max-w-2xl type-small text-muted">{description}</div>}
      {children}
    </section>
  );
}
