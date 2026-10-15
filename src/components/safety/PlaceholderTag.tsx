import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * Marks a detail that is not known yet ("Coordonnées à venir") instead of
 * printing a made-up name, room, hour or address. Dashed, quiet, in words —
 * it must never be mistaken for a real contact.
 */
export function PlaceholderTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-xs border border-dashed border-line-strong px-2 py-1 type-label text-muted",
        className,
      )}
    >
      <Icon name="edit" size={13} className="shrink-0" />
      {children}
    </span>
  );
}
