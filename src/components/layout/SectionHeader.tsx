import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * Editorial section head: a heavy rule, a mono running head (kicker + index)
 * and an action on the same line, then the title. Left-aligned on purpose —
 * no centred "heading + subtitle + three cards".
 */
export function SectionHeader({
  title,
  kicker,
  index,
  action,
  description,
  id,
  as: Tag = "h2",
  size = "section",
  rule = true,
  className,
}: {
  title: ReactNode;
  kicker?: string;
  /** Running number like "02" — reads as a magazine section. */
  index?: string;
  action?: { href: string; label: string };
  description?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
  size?: "section" | "headline" | "display";
  rule?: boolean;
  className?: string;
}) {
  const titleClass = size === "display" ? "type-display" : size === "headline" ? "type-headline" : "type-section";
  return (
    <header className={cx("flex flex-col gap-4", rule && "border-t-2 border-fg pt-3", className)}>
      {(kicker || index || action) && (
        <div className="flex items-baseline justify-between gap-4">
          <p className="flex items-baseline gap-3 type-label text-muted">
            {index && <span className="text-accent-text">{index}</span>}
            {kicker}
          </p>
          {action && (
            <Link
              href={action.href}
              className="group inline-flex shrink-0 items-center gap-1.5 type-label text-fg hover:text-accent-text"
            >
              {action.label}
              <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
      <Tag id={id} className={titleClass}>
        {title}
      </Tag>
      {description && <div className="max-w-2xl text-muted type-lead">{description}</div>}
    </header>
  );
}
