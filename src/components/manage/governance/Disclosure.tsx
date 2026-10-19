import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * An action folded behind its name: the button opens the form in place
 * (native <details>, works on phones and without JavaScript, no modal).
 * Used for everything that asks a question before acting: invite, end a
 * mandate, suspend, propose a successor.
 */
export function Disclosure({
  summary,
  icon,
  tone = "default",
  open,
  className,
  children,
}: {
  summary: ReactNode;
  icon?: IconName;
  /** "danger" for actions that remove a right. */
  tone?: "default" | "danger" | "primary";
  open?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={open} className={cx("group/disc rounded-sm border border-line bg-raised open:border-line-strong", className)}>
      <summary
        className={cx(
          "flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-sm px-3.5 type-button text-[0.78rem] [&::-webkit-details-marker]:hidden",
          "hover:bg-fg/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
          tone === "danger" && "text-danger",
          tone === "primary" && "text-assoc-text",
        )}
      >
        {icon && <Icon name={icon} size={16} className="shrink-0" />}
        <span className="flex-1">{summary}</span>
        <Icon name="chevron-down" size={16} className="shrink-0 text-muted transition-transform group-open/disc:rotate-180" />
      </summary>
      <div className="border-t border-line px-3.5 pb-4 pt-4">{children}</div>
    </details>
  );
}
