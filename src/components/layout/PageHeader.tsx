import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

export interface Crumb {
  href: string;
  label: string;
}

/** Back-trail for nested pages; the last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Fil d'Ariane" className={cx("type-label text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-fg">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="hover:text-fg">
                    {c.label}
                  </Link>
                  <Icon name="chevron-right" size={12} />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Page openers. Two voices:
 *  - poster   : public index pages — huge expanded title, count sticker,
 *               intro set in an offset column (asymmetric).
 *  - document : recruitment/account pages — calmer title, crumbs, meta row.
 */
export function PageHeader({
  variant = "poster",
  title,
  kicker,
  intro,
  aside,
  crumbs,
  meta,
  children,
  className,
}: {
  variant?: "poster" | "document";
  title: ReactNode;
  kicker?: ReactNode;
  intro?: ReactNode;
  /** Poster: sits next to the title on desktop (a sticker, a count). */
  aside?: ReactNode;
  crumbs?: Crumb[];
  /** Document: small facts under the title. */
  meta?: ReactNode;
  /** Filters, search… rendered under the header. */
  children?: ReactNode;
  className?: string;
}) {
  if (variant === "document") {
    return (
      <header className={cx("wrap flex flex-col gap-5 pb-8 pt-8 sm:pt-12", className)}>
        {crumbs && <Breadcrumbs items={crumbs} />}
        {kicker && <p className="type-label text-accent-text">{kicker}</p>}
        <h1 className="type-title max-w-4xl">{title}</h1>
        {intro && <div className="max-w-2xl text-muted type-lead">{intro}</div>}
        {meta && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 type-meta text-muted">{meta}</div>}
        {children}
      </header>
    );
  }

  return (
    <header className={cx("wrap pb-8 pt-10 sm:pt-16", className)}>
      {crumbs && <Breadcrumbs items={crumbs} className="mb-6" />}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          {kicker && <p className="mb-4 type-label text-accent-text">{kicker}</p>}
          <h1 className="type-display">{title}</h1>
        </div>
        {(intro || aside) && (
          <div className="flex flex-col items-start gap-5 lg:col-span-4 lg:pb-2">
            {aside}
            {intro && <div className="text-muted type-lead">{intro}</div>}
          </div>
        )}
      </div>
      {children && <div className="mt-10">{children}</div>}
    </header>
  );
}
