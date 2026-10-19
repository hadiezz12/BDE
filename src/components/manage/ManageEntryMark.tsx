import type { ManageEntry } from "@/lib/governance/workspace";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { AssociationLogo } from "@/components/associations/AssociationLogo";

/** The mark of a "Gérer…" entry: the association's monogram, or an icon for the platform pages. */
export function ManageEntryMark({ entry, size, className }: { entry: ManageEntry; size: number; className?: string }) {
  if (!entry.icon) return <AssociationLogo association={entry} size={size} className={className} />;
  return (
    <span
      aria-hidden
      data-accent={entry.accent}
      className={cx("inline-grid shrink-0 place-items-center rounded-full bg-assoc text-assoc-fg ring-1 ring-line-strong", className)}
      style={{ width: size, height: size }}
    >
      <Icon name={entry.icon} size={Math.round(size * 0.55)} />
    </span>
  );
}
