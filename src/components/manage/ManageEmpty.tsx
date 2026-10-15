import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";

/** What the demo line says when `demo` is just `true`. */
const DEMO_DEFAULT = "les actions de cet espace ne sont pas encore branchées, rien n'est enregistré.";

/**
 * Studio empty state: a dashed sheet where the rows would be. Says what is
 * empty, what will appear here and who adds it, and the next step. The
 * heading level is a prop so it fits the page outline (h2 directly under the
 * page header, h3 inside a ManageSection).
 *
 * PHASE 1 — `demo` adds one quiet line under the text saying that the
 * actions offered here do nothing yet (true = the generic sentence).
 */
export function ManageEmpty({
  title,
  icon = "file",
  mark,
  as: Heading = "h3",
  children,
  actions,
  demo,
  className,
}: {
  title: string;
  icon?: IconName;
  /** Replaces the icon: a big numeral ("0"), an emblem… */
  mark?: ReactNode;
  as?: "h2" | "h3";
  children?: ReactNode;
  actions?: ReactNode;
  /** PHASE 1: "Version de démonstration : …" under the text. */
  demo?: true | ReactNode;
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
        {children && <div className="flex flex-col gap-2 type-small text-muted">{children}</div>}
        {demo && (
          <p className="flex items-start gap-2 type-small text-subtle">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
            <span>
              <span className="font-semibold text-muted">Version de démonstration&nbsp;:</span>{" "}
              {demo === true ? DEMO_DEFAULT : demo}
            </span>
          </p>
        )}
        {actions && <div className="mt-2 flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
