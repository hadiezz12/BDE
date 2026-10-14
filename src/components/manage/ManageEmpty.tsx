import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Studio empty state: a dashed sheet where the rows would be. Says what is
 * empty, why that's normal, and the next step. The heading level is a prop so
 * it fits the page outline (h2 directly under the page header, h3 inside a
 * ManageSection).
 */
export function ManageEmpty({
  title,
  icon = "file",
  mark,
  as: Heading = "h3",
  children,
  actions,
  className,
}: {
  title: string;
  icon?: IconName;
  /** Replaces the icon: a big numeral ("0"), an emblem… */
  mark?: ReactNode;
  as?: "h2" | "h3";
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-4 rounded-md border border-dashed border-line-strong bg-raised px-5 py-6 sm:flex-row sm:items-start sm:gap-5",
        className,
      )}
    >
      <div aria-hidden className="grid size-12 shrink-0 place-items-center rounded-sm bg-sunken text-muted">
        {mark ?? <Icon name={icon} size={22} />}
      </div>
      <div className="flex max-w-xl flex-col gap-2">
        <Heading className="type-card">{title}</Heading>
        {children && <div className="type-small text-muted">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
